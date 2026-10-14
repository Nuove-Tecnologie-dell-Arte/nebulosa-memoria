"""Accende il server della nebulosa.

Uso, dalla cartella nebulosa-memoria:   python3 avvia.py
Le impostazioni sono in .env (copia .env.example): PORTA, INDIRIZZO, CARTELLA_DATI. Le legge programma/config.py,
quindi valgono anche per i file «Apri la nebulosa» e per avvia-server.sh, che passano tutti da qui.
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'programma'))

if __name__ == '__main__':
    import server
    server.main()
