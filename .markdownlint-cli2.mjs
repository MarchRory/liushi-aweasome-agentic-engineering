export default {
  config: {
    default: true,
    MD013: false,
    MD024: {
      siblings_only: true,
    },
    MD033: false,
  },
  globs: ["**/*.md", "!.changeset/*.md", "!**/CHANGELOG.md", "!**/node_modules/**"],
};
