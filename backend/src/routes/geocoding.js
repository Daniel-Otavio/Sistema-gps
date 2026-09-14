const express = require('express');
const { geocodificar } = require('../services/geocoding/nominatim');

function criarRotasGeocodificacao({ pool, autenticar, limiter }) {
    const router = express.Router();

    router.get('/', autenticar, limiter, async (req, res) => {
        try {
            const resultado = await geocodificar({ pool, consulta: req.query.q });
            if (!resultado) return res.status(404).json({ erro: 'Local não encontrado.' });
            return res.json(resultado);
        } catch (erro) {
            if (erro.status === 400) return res.status(400).json({ erro: erro.message });
            return res.status(502).json({ erro: 'Serviço de localização temporariamente indisponível.' });
        }
    });

    return router;
}

module.exports = { criarRotasGeocodificacao };
