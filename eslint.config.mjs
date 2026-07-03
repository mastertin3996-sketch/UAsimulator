import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "prisma/migrations/**",
    ],
  },
  {
    rules: {
      // React Compiler-readiness rules (eslint-plugin-react-hooks v7). This project
      // doesn't use the React Compiler, and these flag the standard/idiomatic
      // "fetch in useEffect, setState in the callback" pattern used throughout —
      // not actual bugs. Downgraded to warnings instead of hard build-breaking errors.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default eslintConfig;
