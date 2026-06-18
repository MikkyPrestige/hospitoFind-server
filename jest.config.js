export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.mjs'],
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^jsdom$': '<rootDir>/tests/__mocks__/jsdom.js',
    '^dompurify$': '<rootDir>/tests/__mocks__/dompurify.js',
  },
};
