import { getInput, setFailed, setOutput, info } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { exec } from '@actions/exec'
import fs from 'node:fs'
import ignore from 'ignore'
import { extname } from 'node:path'

export async function run(): Promise<void> {
  const token = getInput('github_token')
  const prettierIgnore = getInput('prettier_ignore')
  const prettierVersion = getInput('prettier_version')
  const fileExtensions = getInput('file_extensions')
  const github = getOctokit(token)
  const commentIdentifier = '<!-- prettier-check-comment -->'

  const fileExts = fileExtensions.split(',').map(ext => ext.trim())

  async function getAllChangedFiles(): Promise<string[]> {
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
      if (files.length === 0) break
      changedFiles.push(...files.filter(f => f.status !== 'removed').map(f => f.filename))
      page++
    }
    return changedFiles.filter(f => {
      const ext = extname(f)
      return fileExts.includes(ext)
    })
  }

  function filterFiles(files: string[]): string[] {
    if (fs.existsSync(prettierIgnore)) {
      const ig = ignore().add(fs.readFileSync(prettierIgnore, 'utf-8'))
      return files.filter(f => !ig.ignores(f))
    }
    return files
  }

  function quote(args: string[]): string[] {
    return args.map(arg => arg.replace(/([~!#$^&*()\][{}|;'"<>?`\s])/g, '\\$1'))
  }

  let changedFiles = await getAllChangedFiles()
  changedFiles = filterFiles(changedFiles)

  if (changedFiles.length === 0) {
    info('No files to check')
    await updateComment(`${commentIdentifier}\nPrettier check passed! 🎉`)
  } else {
    info('Matched changed files:')
    info(changedFiles.map(f => `- ${f}`).join('\n'))
    await exec('npm', ['install', '--global', `prettier@${prettierVersion}`])

    let stderr = ''
    const exitCode = await exec('prettier', ['--check', ...changedFiles], {
      ignoreReturnCode: true,
      listeners: { stderr: data => (stderr += data.toString()) }
    })

    const prettierOutput = stderr.trim()
    const lines = prettierOutput.split('\n');
    lines.pop()
    const prettierCommand = `npx prettier --write ${quote(lines.map(line => line.trim().replace('[warn] ', ''))).join(' ')}`
    const body =
      exitCode === 0
        ? `${commentIdentifier}\nPrettier check passed! 🎉`
        : `${commentIdentifier}\n🚨 Prettier check failed for the following files:\n\n\`\`\`\n${prettierOutput}\n\`\`\`\n\nTo fix the issue, run the following command:\n\n\`\`\`\n${prettierCommand}\n\`\`\``
    await updateComment(body)

    if (exitCode !== 0) {
      setFailed('\nPrettier check failed 😢')
    }
    setOutput('exitCode', exitCode)
  }

  async function updateComment(body: string): Promise<void> {
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
  }
}
