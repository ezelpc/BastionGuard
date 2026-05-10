module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts", "<rootDir>/src/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  transformIgnorePatterns: ["node_modules/(?!(@kubernetes/client-node)/)"],
  moduleNameMapper: {
    "^@kubernetes/client-node$": "<rootDir>/src/__mocks__/kubernetes.ts",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/index.ts",
    "!src/__mocks__/**",
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  globals: {
    "ts-jest": {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
};
