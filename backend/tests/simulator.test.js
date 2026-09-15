const test = require('node:test');
const assert = require('node:assert/strict');
const { routeCoordinates, distanceKm, bearing, sampleRoute } = require('../tools/gps-empresarial-simulator');

test('extrai coordenadas de FeatureCollection e MultiLineString', () => {
    const route = { type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'MultiLineString', coordinates:[[[-40,-19],[-39.99,-19]],[[-39.99,-19],[-39.98,-19]]] } }] };
    assert.equal(routeCoordinates(route).length, 4);
});

test('amostra o trajeto e calcula direção coerente', () => {
    const points = sampleRoute([[-40,-19],[-39.99,-19]], 0.2);
    assert.ok(points.length > 2);
    assert.ok(distanceKm(points[0], points.at(-1)) > 1);
    assert.ok(Math.abs(bearing(points[0], points.at(-1)) - 90) < 2);
});
