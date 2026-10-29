import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTags, serializeTags } from '../src/tags.ts';

test('hashtags leave the body and become tags', () => {
  assert.deepEqual(extractTags('Good run today #health #running'), { body: 'Good run today', tags: ['health', 'running'] });
});

test('line breaks in the body survive', () => {
  assert.equal(extractTags('First line #a\nSecond line').body, 'First line\nSecond line');
});

test('Greek hashtags are kept', () => {
  assert.deepEqual(extractTags('Βόλτα #υγεία').tags, ['υγεία']);
});

test('serializeTags de-duplicates case-insensitively, keeping the first spelling', () => {
  assert.equal(serializeTags(['Work', 'work', ' health ', '']), 'Work, health');
});

test('serializeTags caps at five and is null when empty', () => {
  assert.equal(serializeTags(['a', 'b', 'c', 'd', 'e', 'f']), 'a, b, c, d, e');
  assert.equal(serializeTags([]), null);
});
