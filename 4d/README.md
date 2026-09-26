# 4D

Ruta publicada: /4d/

Esta interfaz es el MVP visual. Procesa localmente la selección del video para crear la línea temporal y preparar el pipeline.

Pipeline objetivo:
Video → frames → COLMAP → 3D Gaussian Splatting → movimiento 3D → 4D Gaussian representation → compresión temporal.

Los motores pesados se mantienen separados para poder incorporarlos sin rehacer la interfaz.