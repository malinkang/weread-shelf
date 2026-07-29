# WeRead Shelf

A personal 3D library generated from WeRead bookshelf groups. Browse between
shelves with vertical gestures, open books on demand, and use the compact shelf
navigator to jump directly to a collection.

[Live site](https://weread-shelf-orcin.vercel.app/_experiences/complete-shelf/)

## Features

- Syncs public books from every WeRead bookshelf group
- Optionally syncs personal highlights and thoughts for the five most annotated displayed books
- Lets you decorate individual highlight pages and peel the selected sticker with Sticker Forge
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

Personal notes are opt-in. Set `WEREAD_SYNC_NOTES=1` before syncing to include
highlights and thoughts for the 5 displayed books with the most notes. Use
`WEREAD_NOTES_BOOK_LIMIT` to choose a value between 1 and 30:

```bash
export WEREAD_SYNC_NOTES=1
export WEREAD_NOTES_BOOK_LIMIT=5
pnpm sync:weread
```

The generated `public/books/weread/<book-id>/notes.json` files are ignored by
Git, but they become publicly downloadable if you include them in a deployed
build. Only enable note syncing for a private deployment or when you are
comfortable publishing those highlights and thoughts. Bookmark text is never
exported; only the bookmark count is retained.

Without a generated WeRead catalog, the original nineteen-book collection is
used as a fallback.

## Credits

Based on [The Complete Shelf](https://github.com/mintdotgg/mint-playground/tree/main/experiences/complete-shelf)
from the Mint Playground. See `LICENSE` and `THIRD_PARTY_NOTICES.md` for license
and attribution details.
