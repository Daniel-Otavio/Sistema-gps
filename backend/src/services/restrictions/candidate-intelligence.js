'use strict';

const EARTH_KM = 6371;

function distanceKm(a, b) {
    const rad = value => Number(value) * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lng - a.lng);
    const lat1 = rad(a.lat);
    const lat2 = rad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return EARTH_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function compatibleType(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('altura') || normalized.includes('inferior') || normalized.includes('tunel')) return 'altura';
    if (normalized.includes('ponte') || normalized.includes('viaduto')) return 'estrutura';
    if (normalized.includes('peso')) return 'peso';
    return normalized || 'outro';
}

function groupNearbyCandidates(items, radiusMeters = 120) {
    const groups = [];
    for (const item of items) {
        const point = { lat: Number(item.reg?.latitude ?? item.lat), lng: Number(item.reg?.longitude ?? item.lng) };
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
        const family = compatibleType(item.reg?.categoria || item.reg?.tipo || item.tipo);
        const existing = groups.find(group => group.family === family && distanceKm(group.center, point) * 1000 <= radiusMeters);
        if (!existing) {
            groups.push({ family, center: point, representative: item, members: [item] });
            continue;
        }
        existing.members.push(item);
        existing.center = {
            lat: existing.members.reduce((sum, current) => sum + Number(current.reg?.latitude ?? current.lat), 0) / existing.members.length,
            lng: existing.members.reduce((sum, current) => sum + Number(current.reg?.longitude ?? current.lng), 0) / existing.members.length
        };
        if ((item.reg?.categoria === 'DETECCAO_ALTURA') || (!existing.representative.reg?.nome && item.reg?.nome)) existing.representative = item;
    }
    return groups;
}

function evidenceStatus(updatedAt, validityDays = 180, now = new Date()) {
    if (!updatedAt) return 'sem_evidencia';
    const ageDays = (now.getTime() - new Date(updatedAt).getTime()) / 86400000;
    if (!Number.isFinite(ageDays)) return 'sem_evidencia';
    if (ageDays > validityDays) return 'vencida';
    if (ageDays > validityDays * 0.8) return 'envelhecendo';
    return 'atual';
}

function priorityScore({ passages = 0, vehicles = 0, trips = 0, sources = 1, hasDimension = false, evidence = 'sem_evidencia', distanceRouteKm = null }) {
    let score = 10;
    score += Math.min(30, Math.log2(Number(passages) + 1) * 6);
    score += Math.min(18, Number(vehicles) * 4);
    score += Math.min(12, Number(trips) * 2);
    score += Math.min(12, Math.max(0, Number(sources) - 1) * 6);
    if (hasDimension) score += 10;
    if (evidence === 'vencida' || evidence === 'sem_evidencia') score += 8;
    if (distanceRouteKm !== null && Number(distanceRouteKm) <= 0.08) score += 10;
    return Math.max(0, Math.min(100, Math.round(score)));
}

function priorityLevel(score) {
    if (score >= 70) return 'critica';
    if (score >= 45) return 'alta';
    if (score >= 25) return 'media';
    return 'baixa';
}

module.exports = { distanceKm, groupNearbyCandidates, evidenceStatus, priorityScore, priorityLevel };
