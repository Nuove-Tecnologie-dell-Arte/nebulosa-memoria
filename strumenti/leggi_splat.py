"""Legge un Gaussian Splat .ply (formato 3DGS) senza caricarlo tutto in memoria."""
import numpy as np

def apri(percorso):
    with open(percorso, 'rb') as f:
        testa = b''
        while not testa.endswith(b'end_header\n'):
            testa += f.readline()
    righe = testa.decode().splitlines()
    n = int(next(r for r in righe if r.startswith('element vertex')).split()[-1])
    nomi = [r.split()[-1] for r in righe if r.startswith('property float')]
    dt = np.dtype([(k, '<f4') for k in nomi])
    return np.memmap(percorso, dtype=dt, mode='r', offset=len(testa), shape=(n,))
