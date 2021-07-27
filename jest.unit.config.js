module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testRegex: "test.ts",
  silent: false,
  verbose: true,
  collectCoverage: true,
  modulePathIgnorePatterns: ["package"],
};
