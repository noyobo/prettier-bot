# Prettier Bot

A GitHub action for styling changed files on pull_request

## Usage

```yml
name: prettier-check

on:
  pull_request:
    branches:
      - main
  push:
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
        uses: actions/prettier-bot@v1
```
