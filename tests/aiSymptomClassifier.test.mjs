jest.setTimeout(30000);

import { jest } from '@jest/globals';

// Mock the groq client before importing the classifier
const mockCreate = jest.fn();
jest.unstable_mockModule('../utils/groqClient.js', () => ({
  default: jest.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

// Mock allowedServices to return a fixed list
const mockGetAllowedServices = jest.fn();
jest.unstable_mockModule('../utils/allowedServices.js', () => ({
  getAllowedServices: mockGetAllowedServices,
}));

// We'll use the real cache module (it uses in-memory fallback in test)
let classifySymptoms;

beforeAll(async () => {
  const module = await import('../utils/aiSymptomClassifier.js');
  classifySymptoms = module.classifySymptoms;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllowedServices.mockResolvedValue([
    'cardiology',
    'pulmonology',
    'neurology',
    'general',
    'emergency',
  ]);
});

describe('classifySymptoms', () => {
  it('returns empty array for empty input', async () => {
    const result = await classifySymptoms('');
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns services for valid symptom text', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '["cardiology", "pulmonology"]' } }],
    });

    const result = await classifySymptoms('tightness in chest and difficulty breathing');
    expect(result).toEqual(['cardiology', 'pulmonology']);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('filters out services not in allowed list', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '["cardiology", "dentistry"]' } }],
    });

    const result = await classifySymptoms('tooth pain');
    expect(result).toEqual(['cardiology']); // dentistry filtered out
  });

  it('returns empty array on malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Not a JSON' } }],
    });

    const result = await classifySymptoms('headache');
    expect(result).toEqual([]);
  });

  it('caches result and does not call Groq again', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '["neurology"]' } }],
    });

    const first = await classifySymptoms('migraine');
    expect(first).toEqual(['neurology']);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Second call with same input should use cache
    const second = await classifySymptoms('migraine');
    expect(second).toEqual(['neurology']);
    expect(mockCreate).toHaveBeenCalledTimes(1); // still 1
  });

  it('handles Groq API errors gracefully', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API down'));
    const result = await classifySymptoms('fever');
    expect(result).toEqual([]);
  });

  it('returns empty array if allowed services are empty', async () => {
    mockGetAllowedServices.mockResolvedValueOnce([]);
    const result = await classifySymptoms('cough');
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
