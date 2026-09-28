# 4D Engine — motor de reconstrucción

Este es el backend de nuestro proyecto **Espacio-Tiempo 4D**. El frontend de GitHub Pages no finge reconstrucciones: prepara la captura y consulta este worker.

## Objetivo

```
video
  -> frames
  -> SfM / poses (COLMAP o alternativa)
  -> inicialización 3D
  -> Gaussian Splatting
  -> modelado temporal 4D
  -> escena .4dgs
  -> visor WebGPU/WebGL
```

La representación de salida prevista es `.4dgs`: un contenedor temporal con estado gaussiano, movimiento, ventanas de existencia y acceso temporal indexado.

## Estado

El worker es deliberadamente un adaptador GPU. No contiene una "reconstrucción falsa" para simular que entrenó un modelo. El comando de entrenamiento se conecta mediante `RECONSTRUCTION_COMMAND`.

Para la capa de reconstrucción se contemplan 4D Gaussian Splatting, USplat4D y backbones compatibles. 4DGS de Fudan dispone de reconstrucción dinámica y síntesis de nuevas vistas; USplat4D está orientado específicamente a reconstrucción 4D monocular. La selección final del backbone se hará en el worker según el tipo de captura.

## API

- `GET /health`
- `POST /jobs` con multipart `video`
- `GET /jobs/{id}`

Respuesta de creación:

```json
{"id":"...","status":"queued","progress":0}
```

## Ejecución

Requiere Linux + NVIDIA/CUDA para el entrenamiento 4D. GitHub Pages solo sirve el cliente y no puede ejecutar COLMAP/PyTorch/CUDA.

```bash
docker compose up --build
```

El frontend se conecta mediante `window.__4D_ENGINE_URL__`.
