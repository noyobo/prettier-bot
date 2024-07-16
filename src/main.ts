import { getInput, setFailed, setOutput } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { execSync } from 'node:child_process'

export async function run(): Promise<void> {
  const token = getInput('github-token')

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

  const commentIdentifier = '<!-- prettier-check-comment -->'

  if (changedFiles.length === 0) {
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
    const prettierOutput = execSync(`npx prettier --check ${changedFiles.join(' ')}`, { encoding: 'utf8' })
    const hasWarnings = prettierOutput.indexOf('Run Prettier to fix') !== -1
    let body

    if (!hasWarnings) {
      body = `${commentIdentifier}\nPrettier check passed! 🎉`
    } else {
      const lines = prettierOutput.trim().split('\n')
      lines.shift()
      lines.pop()
      const prettierCommand = `npx prettier --write ${lines
        .map(line => line.trim().replace('[warn] ', ''))
        .map(f => JSON.stringify(f))
        .join(' ')}`
      body = `${commentIdentifier}\n🚨Prettier check failed for the following files:\n\n\`\`\`\n${prettierOutput.trim()}\n\`\`\`\n\nTo fix the issue, run the following command:\n\n\`\`\`\n${prettierCommand}\n\`\`\``
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

    if (hasWarnings) {
      setFailed('Prettier check failed')
      setOutput('exitCode', 1)
    } else {
      console.log('Prettier check passed')
      setOutput('exitCode', 0)
    }
  }
}
