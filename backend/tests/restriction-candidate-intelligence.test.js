'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupNearbyCandidates, evidenceStatus, priorityScore, priorityLevel } = require('../src/services/restrictions/candidate-intelligence');

test('agrupa fontes próximas sem confirmar o risco', () => {
    const items = [
        { reg: { latitude: -19.40, longitude: -40.07, categoria: 'PONTE_SIMILAR' } },
        { reg: { latitude: -19.4003, longitude: -40.0702, categoria: 'PONTE_SIMILAR' } },
        { reg: { latitude: -19.41, longitude: -40.08, categoria: 'PONTE_SIMILAR' } }
    ];
    const groups = groupNearbyCandidates(items, 120);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].members.length, 2);
    assert.equal(groups[0].status, undefined);
});

test('evidência vencida aumenta prioridade de revisão', () => {
    const status = evidenceStatus('2025-01-01T00:00:00Z', 180, new Date('2026-09-15T00:00:00Z'));
    assert.equal(status, 'vencida');
    const score = priorityScore({ passages: 40, vehicles: 4, trips: 8, sources: 2, evidence: status });
    assert.equal(priorityLevel(score), 'critica');
});

test('candidato sem rota prévia pode ser priorizado por passagens reais', () => {
    const score = priorityScore({ passages: 12, vehicles: 3, trips: 4, sources: 1, evidence: 'sem_evidencia', distanceRouteKm: null });
    assert.ok(score >= 45);
});
