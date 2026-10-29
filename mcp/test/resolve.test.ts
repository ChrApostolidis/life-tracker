import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveByName } from '../src/resolve.ts';

const projects = [
  { id: 'p1', name: 'Life Tracker' },
  { id: 'p2', name: 'Life Tracker API' },
  { id: 'p3', name: 'Portfolio' },
  { id: 'p4', name: 'Pottery' },
];

test('an exact name wins over a longer name it prefixes', () => {
  assert.equal(resolveByName(projects, 'life tracker', 'project').id, 'p1');
});

test('the match ignores case and extra whitespace', () => {
  assert.equal(resolveByName(projects, '  LIFE   tracker api ', 'project').id, 'p2');
});

test('an id resolves directly', () => {
  assert.equal(resolveByName(projects, 'p3', 'project').name, 'Portfolio');
});

test('a unique prefix resolves', () => {
  assert.equal(resolveByName(projects, 'port', 'project').id, 'p3');
});

test('an ambiguous prefix lists the candidates', () => {
  assert.throws(
    () => resolveByName(projects, 'po', 'project'),
    (e: Error) => e.message.includes('Portfolio [id:p3]') && e.message.includes('Pottery [id:p4]') && !e.message.includes('Life'),
  );
});

test('no match lists every candidate', () => {
  assert.throws(
    () => resolveByName(projects, 'garden', 'project'),
    (e: Error) => e.message.startsWith('No project matches "garden"') && e.message.includes('Pottery [id:p4]'),
  );
});

test('duplicate exact names ask for the id', () => {
  const habits = [
    { id: 'h1', name: 'Read' },
    { id: 'h2', name: 'read' },
  ];
  assert.throws(() => resolveByName(habits, 'Read', 'habit'), /Several habits are called "Read".*Use the id/);
});

test('an empty list and an empty query say so', () => {
  assert.throws(() => resolveByName([], 'x', 'habit'), /There are no habits yet/);
  assert.throws(() => resolveByName(projects, '   ', 'project'), /Give a project name or id/);
});
