# pages/

Route-level view components. One folder per page:

```
pages/
├── Home/
│   ├── Home.tsx          # imports './Home.scss' once; uses real class names
│   ├── Home.scss         # traditional SCSS (no CSS modules)
│   └── index.ts
└── About/
    └── ...
```

Pages compose components, wire up data via hooks/services, and own routing concerns. Routes are registered in `src/app/routes.ts` (preact-iso, lazy). Pages render inside the side panel; the board never unmounts.

**Pages live here, not in `src/components/`.** A page is a route/screen-level view. The
pieces a page is built from go in `src/components/<feature-or-component>/`, and primitive
shared building blocks (Button, Input, Modal, …) in `src/components/common/<Component>/`.
