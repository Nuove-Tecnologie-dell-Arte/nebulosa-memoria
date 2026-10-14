"""Il lettore: guarda una foto appena arrivata e ne scrive la lettura, come per tutte le altre.

Funziona se e' installato il pacchetto `anthropic` (pip3 install anthropic) e ci sono le credenziali
(la variabile ANTHROPIC_API_KEY, oppure un profilo creato con `ant auth login`).
Senza, la foto resta nella nebulosa con un posto provvisorio, finche' non viene letta a mano.
"""
import base64, collections, io, json

try:
    import anthropic
except ImportError:
    anthropic = None

MODELLO = 'claude-opus-5-5'
_client = None


def disponibile():
    global _client
    if anthropic is None:
        return False
    if _client is None:
        try:
            _client = anthropic.Anthropic()
        except Exception:
            return False
    return True


def schema(analisi):
    """La forma della risposta: lettura, tag e, se la nebulosa ha i suoi gruppi di senso (nuclei), il gruppo della foto."""
    nuclei = [n['id'] for n in analisi.get('nuclei', [])]
    proprieta = {'lettura': {'type': 'string'}, 'tag': {'type': 'array', 'items': {'type': 'string'}}}
    if nuclei:
        proprieta['nucleo'] = {'type': 'string', 'enum': nuclei}
    return {'type': 'object', 'properties': proprieta, 'required': list(proprieta), 'additionalProperties': False}


def istruzioni(analisi):
    foto = [f for f in analisi['foto'].values() if f.get('lettura')]
    conta = collections.Counter(t for f in foto for t in f['tag'])
    vocabolario = ', '.join(f'{t} ({n})' for t, n in conta.most_common())
    esempi = '\n'.join(f'- «{f["lettura"]}» → {", ".join(f["tag"])}' for f in foto[::max(1, len(foto) // 6)][:6])
    return (
        f"Stai custodendo «Nebulosa», una memoria collettiva di foto di un luogo ({analisi.get('luogo') or 'un luogo'}), "
        "scattate e mandate da chi lo vive. Ogni foto viene letta a fondo: non ti fermare a quello che si vede in superficie "
        "(colori, scritte, oggetti), ma chiediti che cosa la foto rappresenta e vuole dire, che momento racconta, che rapporto "
        "c'è tra le persone e il luogo, che cosa custodisce.\n\n"
        "Scrivi:\n"
        "- lettura: una o due frasi in italiano, semplici e concrete. Prima cosa si vede, poi che cosa significa.\n"
        "- tag: da 4 a 5 tag di senso, il più importante per primo. Usa il più possibile i tag che esistono già "
        "(il numero dice quante foto lo hanno): così la foto si avvicina a quelle che dicono la stessa cosa. "
        "Inventa un tag nuovo solo se nessuno di quelli esistenti va bene, con lo stesso stile (parole semplici, minuscole).\n\n"
        f"Alcune letture già fatte, come esempio di stile:\n{esempi}\n\n"
        f"I tag che esistono già:\n{vocabolario}"
        + (("\n\n- nucleo: il gruppo di senso a cui la foto appartiene di più, scelto tra questi (scrivi il nome esatto):\n"
            + '\n'.join(f"- {n['id']}: {n.get('testo', '')}" for n in analisi['nuclei'])) if analisi.get('nuclei') else '')
    )


def leggi_foto(jpeg, frase, analisi):
    """Restituisce {'lettura': ..., 'tag': [...], 'nucleo': ...}, oppure None se non e' stato possibile leggerla."""
    if not disponibile():
        return None
    testo = 'Ecco una foto appena arrivata nella nebulosa.' + (f' Chi l\'ha mandata ha scritto: «{frase}».' if frase else '')
    try:
        r = _client.beta.messages.create(
            model=MODELLO, max_tokens=16000,
            betas=['server-side-fallback-2026-07-01'], fallbacks='default',
            output_config={'effort': 'high', 'format': {'type': 'json_schema', 'schema': schema(analisi)}},
            system=istruzioni(analisi),
            messages=[{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': base64.standard_b64encode(jpeg).decode()}},
                {'type': 'text', 'text': testo}]}],
        )
    except anthropic.AuthenticationError:
        print('  il lettore non ha credenziali valide: la foto resta con un posto provvisorio')
        return None
    except anthropic.APIConnectionError:
        print('  il lettore non raggiunge internet: la foto resta con un posto provvisorio')
        return None
    except anthropic.APIStatusError as e:
        print(f'  il lettore ha avuto un errore ({e.status_code}): la foto resta con un posto provvisorio')
        return None
    if r.stop_reason == 'refusal':
        print('  il lettore non ha voluto leggere questa foto: resta con un posto provvisorio')
        return None
    try:
        j = json.loads(next(b.text for b in r.content if b.type == 'text'))
    except (StopIteration, json.JSONDecodeError):
        return None
    tag = [t.strip().lower() for t in j.get('tag', []) if t.strip()][:5]
    if not j.get('lettura') or not tag:
        return None
    res = {'lettura': j['lettura'].strip(), 'tag': tag}
    if j.get('nucleo') in {n['id'] for n in analisi.get('nuclei', [])}:
        res['nucleo'] = j['nucleo']   # cosi' entra nella sua isola, come le altre
    return res
