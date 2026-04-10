# OmniSearch Content Search Guide

This guide explains the new inline content search syntax in OmniSearch, how it behaves, and what to test.

## What Changed

Before this feature:

- OmniSearch searched the indexed full path and filename.
- The UI filters then narrowed by extension, size, and created date.
- OmniSearch did not open files and read their text contents.

Now:

- OmniSearch still does the fast indexed path/name search first.
- If your query includes `content:` syntax, OmniSearch also opens the remaining matching files and scans their contents.
- Normal searches stay fast because content scanning only runs when you explicitly use content syntax.

## How It Works

Search order is:

1. The normal search text narrows results by full path and filename.
2. Inline `ext:` filters narrow file types.
3. The existing UI filters narrow by extension box, size, and date.
4. Content search scans the remaining files from disk last.

That means:

- `report ext:txt content:"hello"` is much faster than `content:"hello"` by itself.
- `content:` is intentionally the slower final step.
- Folders are never content-searched.

## Supported Inline Syntax

### 1. `content:<text>`

Auto-detect text mode.
Best default choice for normal use.

Examples:

- `content:hello`
- `content:"hello world"`
- `ext:txt content:"invoice number"`

### 2. `ansicontent:<text>`

Treat the file as ANSI text.
Useful for older `.ini`, `.bat`, `.cmd`, `.log`, or legacy exported text files.

Examples:

- `ansicontent:"[Settings]"`
- `ext:ini ansicontent:"InstallPath"`

### 3. `utf8content:<text>`

Treat the file as UTF-8 text.
Best for modern source code, JSON, Markdown, and most text files.

Examples:

- `utf8content:"useEffect"`
- `ext:json utf8content:"apiKey"`

### 4. `utf16content:<text>`

Treat the file as UTF-16 little-endian text.
Useful for some Windows-generated text files and exported logs.

Examples:

- `utf16content:"Event ID"`
- `ext:txt utf16content:"Windows Error Reporting"`

### 5. `utf16becontent:<text>`

Treat the file as UTF-16 big-endian text.
Less common, but supported for testing and compatibility.

Examples:

- `utf16becontent:"Title"`
- `ext:txt utf16becontent:"Chapter 1"`

### 6. `ext:<list>`

Inline extension filter inside the search bar.
Use a semicolon-separated list.

Examples:

- `ext:txt`
- `ext:ts;tsx`
- `ext:log;txt content:"error"`
- `src ext:rs;toml content:"tauri"`

Notes:

- Do not put spaces inside an unquoted list like `ext:ts; tsx`.
- If you need spaces for some reason, quote the whole value: `ext:"ts;tsx"`.
- You can repeat `ext:` more than once, but a single semicolon list is cleaner.

## Basic Rules

- Content matching is case-insensitive.
- If the text has spaces, use quotes.
- The normal part of the query is a plain substring match against the full path.
- Inline `ext:` and the Extension input box both apply. If they conflict, you may get no results.
- Use one content clause per query for predictable behavior.

## Real Query Examples

### Search code files for a phrase

- `ext:ts;tsx content:"useEffect"`
- `ext:rs content:"tauri::command"`
- `ext:cpp;h content:"CreateFileW"`

### Search only text files

- `ext:txt content:"meeting notes"`
- `ext:md content:"quick start"`
- `ext:log content:"connection refused"`

### Search in a folder area plus file contents

- `src ext:tsx content:"before"`
- `components ext:ts;tsx content:"onClick"`
- `docs ext:md content:"installation"`

### Search config and project files

- `ext:json;toml;yml;yaml content:"localhost"`
- `ext:ini;cfg content:"timeout"`
- `ext:env;txt content:"API_KEY"`

### Search source code for TODOs and markers

- `ext:ts;tsx;js;jsx content:TODO`
- `ext:rs content:"FIXME"`
- `ext:cpp;h content:"HACK"`

### Search logs and exports

- `ext:log;txt content:"Access denied"`
- `ext:csv content:"invoice"`
- `ext:sql content:"CREATE TABLE"`

### Test encoding-specific behavior

- `utf8content:"hello world"`
- `ansicontent:"[General]"`
- `utf16content:"Event Viewer"`
- `utf16becontent:"Sample Text"`

## Good Test Queries

These are good tests because they cover the main paths:

- `ext:tsx content:"before"`
- `ext:md content:"quick start"`
- `ext:json utf8content:"name"`
- `ext:txt ansicontent:"error"`
- `ext:txt utf16content:"Event ID"`
- `src ext:ts;tsx content:"useState"`
- `docs ext:md content:"install"`
- `content:"license"`

## Performance Tips

Fastest:

- `src ext:ts;tsx content:"before"`
- `docs ext:md content:"install"`

Usually okay:

- `ext:txt content:"hello"`
- `ext:log content:"warning"`

Slowest:

- `content:"hello"`
- `utf8content:"hello"`

Best practices:

- Always add `ext:` when possible.
- Add a normal path/name term too when possible.
- Use the UI size/date filters to reduce candidates before content search runs.
- Expect the app to take longer when scanning many files from disk.

## Things That Are Not Supported Yet

This is what the current version does not fully do yet:

- Full iFilter-style document parsing like Everything can do with external filters
- Reliable deep content extraction for PDF, DOCX, XLSX, and similar document formats
- Search result snippets showing the matching line
- Ranking by content hit quality
- Search bar operators like `size:>10gb` and `date:today`

For now:

- Use the UI fields for size and date filters.
- Use content search mainly for text-like files such as code, logs, JSON, Markdown, INI, CSV, SQL, and TXT.

## Troubleshooting

### No results

Try:

- Use quotes for phrases: `content:"hello world"`
- Narrow with `ext:txt` or `ext:ts;tsx`
- Remove the Extension box filter if it conflicts with `ext:`
- Try `utf8content:` or `utf16content:` if the file encoding is special

### Too slow

Try:

- Add a path term like `src`, `docs`, `config`, or part of the folder name
- Add `ext:`
- Add UI date filters
- Add UI size filters
