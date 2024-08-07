/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.m?[tj]sx?$": ["ts-jest", {}],
  },
};
