# Published component sources

15 new registry components plus the previously integrated 21st TextShimmer are used in the application. Original registry JSON is retained here; manifest.json records upstream content hashes and the corresponding adapted file hashes. label.json is a retrieved reference, not an installed component.

| Source | Components | Application use |
|---|---|---|
| Aceternity | Sidebar, Bento Grid | Workspace navigation and live summary counts |
| shadcn/ui | Button, Card, Input, Textarea, Native Select, Badge, Tabs, Dialog, Tooltip, Alert, Skeleton, Sonner | Actions, forms, review cards, source history, dialogs and feedback |
| Componentry | Circuit Board | Dependency path and connected workspace graph |
| 21st Agent Elements | TextShimmer | Pending extraction and drafting feedback |

The components were selected from the 21st.dev ecosystem and obtained from the authors' public registries. No paid or restricted registry endpoint was bypassed. Aceternity and Componentry source imports were adapted to the existing Motion package. Application-specific data layout, API bindings and business rules remain PromiseGraph code.

Adaptations: shared Interfere-derived CSS tokens; local utility import paths; a Vite theme prop for Sonner; semantic anchor props and a shadcn focus-trapped mobile drawer for Sidebar; keyboard selection, unique SVG IDs, reduced motion and shared colors for Circuit Board. Unused Circuit Board sample patterns and standalone demonstration effects were excluded. Sidebar and Bento Grid retain their published structure and are themed through application classes.

The reference's Inter Variable font is self-hosted through Fontsource. Proprietary reference fonts were not copied. Components do not all share one license: see THIRD_PARTY_NOTICES.md and licenses/.

The first-use illustration at `public/assets/connected-evidence.png` was generated with ImageGen for this application on 16 October 2026. It is an illustrative connected-paper asset, not a copied registry component or a factual dependency diagram. It appears only after the saved workspace successfully loads with no commitments. Loading, failed requests, empty graphs, and searches with no matches use the existing published Card, Alert, Skeleton, TextShimmer, and Button components. No new visual primitive or dependency was introduced in this continuation.

Glitch correction, 16 October 2026: the Aceternity Sidebar integration now gates hover-driven expansion on its animation setting and gates its portalled mobile dialog on the mobile breakpoint. Resizing to desktop closes the drawer. The original registry snapshot remains unchanged; the adapted-file hash and adaptation record have been updated in the manifest.
