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
  // Migrated from deprecated `globals` — see https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/index.ts",
    "!src/__mocks__/**",
    // Infrastructure providers require real cloud/Docker runtimes — not unit-testable
    "!src/providers/**",
    // Server bootstrap and manual entry-point scripts are integration-level
    "!src/server/**",
    "!src/test-executor.ts",
    "!src/demo.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
