# The Complete Shelf

<a href="https://play.mint.gg/complete-shelf">
  <img src="https://play.mint.gg/experience-assets/complete-shelf/social-card.webp" alt="A warm editorial 3D bookshelf with colorful procedural hardcovers arranged above a walnut shelf." width="100%">
</a>

Browse nineteen procedural hardcovers on a continuous 3D shelf, then pull any volume forward to orbit, zoom, and inspect its editorial details.

[Live demo](https://play.mint.gg/complete-shelf) · [Source code](https://github.com/mintdotgg/mint-playground/tree/main/experiences/complete-shelf)

Made with [Mint MCP](https://mcp.mint.gg/) as the 3D asset pipeline and
[Mint Three.js Skills](https://github.com/mintdotgg/mint-threejs-skills) as the coding workflow.

## Run locally

From the `mint-playground` repository root:

```bash
pnpm install
pnpm --dir experiences/complete-shelf dev
```

## Use your WeRead shelf

Set a WeRead agent API key, then generate a local catalog grouped by your
WeRead bookshelf folders. By default, the most recently read 8 public books
from each group are displayed:

```bash
export WEREAD_API_KEY=<your-api-key>
pnpm --dir experiences/complete-shelf sync:weread
pnpm --dir experiences/complete-shelf dev
```

The sync excludes private entries, downloads high-resolution cover art under
`public/books/weread/`, and writes `public/weread-catalog.json`. Both generated
paths are ignored by Git. Set `WEREAD_BOOKS_PER_SHELF` to a value between 1 and
20 to change the number of books displayed per group. Without a generated
catalog, the original nineteen-book collection remains the fallback.
