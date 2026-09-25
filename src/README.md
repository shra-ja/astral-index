# Frontend

`main.ts` renders the local-app empty state and game selector. `style.css` contains
bundled responsive styling; there are no remote fonts/assets. Tests import the
actual entry point, so startup is included in coverage. Keep future native I/O
behind typed backend commands rather than adding filesystem access here.

Frontend tests live in `tests/` within this directory. Application-wide native
end-to-end tests live in the repository-root `tests/`.
