# Frontend

`main.ts` renders the local-app empty state and game selector. For Honkai: Star Rail
it adds the retrieval panel: a "Start retrieval" button and, below it, a `data_2`
file chooser that is always available. Both find the saved request and check it
with HoYoverse, with a message for each failure kind. `commands.ts` is the typed
client for the native extraction commands; it checks the file size before
reading and returns failure kinds only, plus the code for API errors. `style.css` contains
bundled responsive styling; there are no remote fonts/assets. Tests import the
actual entry point, so startup is included in coverage. Keep future native I/O
behind typed backend commands rather than adding filesystem access here.

Frontend tests live in `tests/` within this directory. Application-wide native
end-to-end tests live in the repository-root `tests/`.
