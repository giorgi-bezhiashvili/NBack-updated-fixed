// Shorthand form (no body) — under moduleResolution "bundler", a fully
// typed `declare module "x" { ... }` block gets shadowed once TS finds a
// real, untyped .js file for that package on disk. The shorthand form is
// honored regardless, at the cost of typing the module as `any`.
declare module "mongo-sanitize";
declare module "hpp";
