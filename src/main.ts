import { getInput, setFailed, setOutput, info } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { exec } from '@actions/exec'
import fs from 'node:fs'
import ignore from 'ignore'

function quote(args: string[]): string[] {
  // add slashes to escape quotes
  return args.map(arg => arg.replace(/([$'"[\]<>(){}\s])/g, '\\$1'))
}

export async function run(): Promise<void> {
  const token = getInput('github_token')
  const prettierIgnore = getInput('prettier_ignore')
  const prettierVersion = getInput('prettier_version')

  const github = getOctokit(token)

  const getAllChangedFiles = async (): Promise<string[]> => {
    const changedFiles: string[] = []
    let page = 1
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: files } = await github.rest.pulls.listFiles({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.issue.number,
        per_page: 100,
        page
      })
      if (files.length === 0) {
        break
      }
      const notDeletedFiles = files.filter(f => f.status !== 'removed')
      changedFiles.push(...notDeletedFiles.map(f => f.filename))
      page++
    }
    return changedFiles
  }

  let changedFiles = await getAllChangedFiles()

  changedFiles = changedFiles.filter(f => /\.(js|jsx|ts|tsx|json|json5|css|less|scss|sass|html|md|mdx|vue)$/.test(f))

  if (fs.existsSync(prettierIgnore)) {
    const ig = ignore().add(fs.readFileSync(prettierIgnore, 'utf-8'))
    changedFiles = changedFiles.filter(f => !ig.ignores(f))
  }

  const commentIdentifier = '<!-- prettier-check-comment -->'

  if (changedFiles.length === 0) {
    info('No files to check')
    const body = `${commentIdentifier}\nPrettier check passed! 🎉`
    const { data: comments } = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number
    })

    const comment = comments.find(c => c.body!.includes(commentIdentifier))

    if (comment) {
      await github.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: comment.id,
        body
      })
    }
  } else {
    info('Matched changed files:')
    info(changedFiles.map(f => `- ${f}`).join('\n'))
    await exec('npm', ['install', '--global', `prettier@${prettierVersion}`])

    let stderr = ''
    const exitCode = await exec('prettier', ['--check', ...changedFiles], {
      ignoreReturnCode: true,
      listeners: {
        stderr: (data: Buffer) => {
          stderr += data.toString()
        }
      }
    })

    let body
    if (exitCode === 0) {
      body = `${commentIdentifier}\nPrettier check passed! 🎉`
    } else {
      const prettierOutput = stderr
      const lines = prettierOutput.trim().split('\n')
      lines.pop()
      const prettierCommand = `npx prettier --write ${quote(lines.map(line => line.trim().replace('[warn] ', ''))).join(
        ' '
      )}`
      body = `${commentIdentifier}\n🚨 Prettier check failed for the following files:\n\n\`\`\`\n${prettierOutput.trim()}\n\`\`\`\n\nTo fix the issue, run the following command:\n\n\`\`\`\n${prettierCommand}\n\`\`\``
    }

    const { data: comments } = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number
    })

    const comment = comments.find(c => c.body!.includes(commentIdentifier))

    if (comment) {
      await github.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: comment.id,
        body
      })
    } else {
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body
      })
    }

    if (exitCode === 0) {
      info('\nPrettier check passed 🎉')
    } else {
      setFailed('\nPrettier check failed 😢')
    }
    setOutput('exitCode', 0)
  }
}
