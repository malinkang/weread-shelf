# WeRead Shelf

A personal 3D library generated from WeRead bookshelf groups. Browse between
shelves with vertical gestures, open books on demand, and use the compact shelf
navigator to jump directly to a collection.

[Live site](https://weread-shelf-orcin.vercel.app/_experiences/complete-shelf/)

## Features

- Syncs public books from every WeRead bookshelf group
- Downloads high-resolution covers and derives matching spine colors locally
- Keeps private WeRead entries and credentials out of Git
- Supports vertical shelf paging, direct shelf navigation, and click-to-open books
- Uses the original close-up editorial shelf treatment on desktop and mobile

## Run locally

```bash
pnpm install
export WEREAD_API_KEY=<your-api-key>
pnpm sync:weread
pnpm dev
```

The sync displays the 8 most recently read public books from each group by
default. Set `WEREAD_BOOKS_PER_SHELF` to a value between 1 and 20 to change the
limit. Generated catalog data and downloaded covers are ignored by Git.

Without a generated WeRead catalog, the original nineteen-book collection is
used as a fallback.

## Credits

Based on [The Complete Shelf](https://github.com/mintdotgg/mint-playground/tree/main/experiences/complete-shelf)
from the Mint Playground. See `LICENSE` and `THIRD_PARTY_NOTICES.md` for license
and attribution details.
