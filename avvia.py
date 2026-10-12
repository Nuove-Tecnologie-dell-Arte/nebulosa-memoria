"""Accende il server della nebulosa leggendo le impostazioni da .env.

Uso, dalla cartella nebulosa-memoria:   python3 avvia.py
Le impostazioni sono in .env (copia .env.example): PORTA, INDIRIZZO.
Una variabile gia' presente nell'ambiente vince su quella del file.
"""
import os, sys

QUI = os.path.dirname(os.path.abspath(__file__))


def carica_env(percorso):
    """Legge le righe CHIAVE=valore di un file .env (senza librerie); # inizia un commento."""
    try:
        righe = open(percorso, encoding='utf-8').read().splitlines()
    except FileNotFoundError:
        return
    for riga in righe:
        riga = riga.strip()
        if not riga or riga.startswith('#') or '=' not in riga:
            continue
        chiave, valore = riga.split('=', 1)
        chiave, valore = chiave.strip(), valore.strip()
        if len(valore) >= 2 and valore[0] == valore[-1] and valore[0] in '"\'':
            valore = valore[1:-1]
        os.environ.setdefault(chiave, valore)


if __name__ == '__main__':
    carica_env(os.path.join(QUI, '.env'))
    sys.path.insert(0, os.path.join(QUI, 'programma'))
    import server
    server.main()
