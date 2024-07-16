# Prettier Bot

A GitHub action for styling changed files on pull_request

## Usage

```yml
name: prettier-check

on:
  pull_request:  # Must run on pull requests
    branches:
      - main

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  prettier-bot:
    name: Prettier Bot
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Prettier Bot
        uses: noyobo/prettier-bot@v1
```

### Default Behavior

- Matched changed files `/\.(js|jsx|ts|tsx|json|json5|css|less|scss|sass|html|md|mdx|vue)$/` on the pull request
- Use root `.prettierrc` file for prettier configuration
- Use root `.prettierignore` file for prettier ignore
