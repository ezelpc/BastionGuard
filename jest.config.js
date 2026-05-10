module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts", "<rootDir>/src/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  extensionsToTreatAsEsm: [".ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/index.ts",
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
      useESM: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
};
