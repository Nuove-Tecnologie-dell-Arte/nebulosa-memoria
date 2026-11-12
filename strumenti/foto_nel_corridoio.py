"""Le foto scattate nel corridoio del chiostro ricostruito in 3D (il PRIMO PIANO dell'Accademia), e dove metterle.

L'elenco l'ha fatto Claude guardando tutte le foto e confrontandole con il modello: con le pareti del corridoio
«srotolate» lato per lato e con le viste che una persona in piedi avrebbe da ogni punto dell'anello
(ricostruite dal modello). Le altre foto (aule, laboratori, museo, teatro, altri piani) non sono in questo modello:
nella nebulosa restano spente e si accendono con il pulsante «Mostra tutte le foto».

Il giro dell'anello (t da 0 a 1) e' quello della nebulosa: lato 1 da t 0 a 0,24, lato 2 fino a 0,5,
lato 3 fino a 0,74, lato 4 (quello dello scalone) fino a 1. Camminando «avanti» le arcate sul cortile sono a destra.

Per ogni foto:
- gruppo:  corridoio, cortile (visto dalle finestre del corridoio) o scalone (il blocco dello scalone sul lato 4)
- t, lato: il punto da cui e' stata scattata (lato: -1 contro il muro esterno, +1 contro le arcate, 0 al centro)
- h:       l'altezza della bolla (1 = occhi)
- guarda:  dove guardava chi l'ha scattata: avanti / indietro (lungo il corridoio), muro, cortile; null se non si sa
- preciso: true se il punto e' stato riconosciuto (dettagli del modello che si vedono nella foto),
           false se si sa solo il gruppo e il posto e' scelto lungo l'anello (si puo' correggere a mano nel .json)
- nota:    perche'

Uso, dalla cartella New Nebulosa:   .venv\\Scripts\\python.exe strumenti\\foto_nel_corridoio.py
(riscrive modello/foto-nel-corridoio.json: se l'hai corretto a mano, correggi qui invece)
"""
import json, os

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USCITA = os.path.join(PROGETTO, 'modello', 'foto-nel-corridoio.json')

# id: (gruppo, t, lato, h, guarda, preciso, nota)
FOTO = {
    # ---- riconosciute: si vede dove sono state scattate ----
    '378': ('corridoio', .236, 0, 1.05, 'indietro', True,
            "dalla porta verde in fondo al lato 1, guardando indietro: le arcate a sinistra, il muro con le bacheche a destra, "
            "lo striscione «25 manifesti per Napoli» appeso a qualche campata (nel modello a t 0,20)"),
    '353': ('corridoio', .238, 0, 2.15, 'indietro', False,
            "dall'alto, da un'apertura sopra la porta in fondo al lato 1: si vede lo striscione nero «25 manifesti per Napoli»"),
    '314': ('corridoio', .255, 0, 1.05, 'avanti', True,
            'all\'inizio del lato 2, guardando avanti: a sinistra la parete con le due file di finestre in pietra '
            '(solo il lato 2 e\' cosi\'), a destra i finestroni ad arco'),
    '456': ('corridoio', .555, -.2, 1.05, 'avanti', True,
            'all\'inizio del lato 3, guardando avanti: a sinistra le bacheche con i manifesti, in fondo la porta illuminata'),
    '468': ('corridoio', .045, -.2, 1.05, 'avanti', False,
            'all\'inizio del lato 1, guardando avanti: a sinistra le bacheche, in fondo la porta verde con la statua'),
    # ---- del corridoio, ma il punto preciso non si riconosce ----
    '213': ('corridoio', .497, 0, 2.15, 'indietro', False, "il corridoio visto dall'alto, da un'apertura in fondo a un lato (quale non si riconosce)"),
    '288': ('corridoio', .48, .7, 1.05, None, False, 'un angolo del corridoio: il cubo rosso, il marmo con la fascia grigia, il finestrone'),
    '458': ('corridoio', .14, -.7, .8, None, False, 'le ruote colorate sul pavimento a fasce grigie'),
    '459': ('corridoio', .33, -.7, .8, None, False, 'gli scatoloni sul pavimento a fasce grigie, lo zoccolo di pietra'),
    '476': ('corridoio', .39, 0, .6, None, False, 'il pavimento: marmo bianco e fascia grigia'),
    '457': ('corridoio', .66, 0, .6, None, False, 'il pavimento di marmo del corridoio'),
    '461': ('corridoio', .43, -.85, 1.05, 'muro', False, 'una porta sul corridoio, pavimento di marmo'),
    '465': ('corridoio', .68, -.85, 1.05, 'muro', False, 'una porta tagliafuoco aperta sul corridoio'),
    '454': ('corridoio', .2, .9, 1.1, 'cortile', False, 'un finestrone a griglia con lo stipite di pietra'),
    '471': ('corridoio', .115, -.95, 1.1, 'muro', False, 'il portone verde aperto sul corridoio (dietro, gli armadietti bianchi)'),
    '472': ('corridoio', .118, -.95, 1.5, 'muro', False, 'l\'ascensore dietro il portone verde, accanto agli armadietti bianchi'),
    '289': ('corridoio', .122, -.95, .8, 'muro', False, 'il disimpegno con l\'ascensore e il finestrone, oltre una porta del corridoio'),
    '381': ('corridoio', .998, 0, 1.05, 'avanti', False, 'le statue davanti alla porta verde (forse oltre la porta in fondo al lato 4)'),
    # ---- lo scalone: il blocco sul lato 4, verso il cortile ----
    '380': ('scalone', .862, .9, 1.4, 'cortile', False, 'lo scalone visto dall\'alto, con lo striscione rosso'),
    '382': ('scalone', .868, .9, 1.2, 'cortile', False, 'lo scalone con il David, visto dall\'alto'),
    '469': ('scalone', .874, .9, 1.6, 'cortile', False, 'lo scalone dall\'alto con il David'),
    '470': ('scalone', .88, .7, .8, 'cortile', False, 'lo scalone con le statue'),
    '408': ('scalone', .886, .7, 1.1, 'cortile', False, 'la rampa dello scalone'),
    '477': ('scalone', .878, .5, .6, 'cortile', False, 'i gradini di marmo dello scalone'),
    '212': ('scalone', .892, .9, 1.5, 'cortile', False, 'il cortile dalla finestra dello scalone'),
    '350': ('scalone', .856, .9, 1.5, 'cortile', False, 'il cortile dalla finestra ad arco dello scalone'),
    '446': ('scalone', .85, .6, 1.05, 'cortile', False, 'i gradini sotto le volte, verso una porta'),
    '447': ('scalone', .896, .6, 1.05, 'cortile', False, 'le volte a crociera e lo zoccolo di pietra, vicino alle scale'),
    '182': ('scalone', .9, .5, 1.3, None, False, 'una porta sotto la volta a crociera, con il bassorilievo'),
    '383': ('scalone', .846, .6, 1.2, None, False, 'il portale ad arco a vetri e i gradini di marmo'),
    # ---- il cortile visto dalle finestre del primo piano: davanti ai finestroni ----
    '463': ('cortile', .03, .95, 1.3, 'cortile', False, 'il cortile e i finestroni ad arco del corridoio, affacciati'),
    '462': ('cortile', .09, .95, 1.4, 'cortile', False, 'il cortile con il giardino e le arcate, dall\'alto'),
    '439': ('cortile', .16, .95, 1.3, 'cortile', False, 'il cortile con la palma, dall\'alto'),
    '440': ('cortile', .21, .95, 1.4, 'cortile', False, 'il cortile al buio, dall\'alto'),
    '411': ('cortile', .28, .95, 1.3, 'cortile', False, 'il cortile dall\'alto, alberi e facciata'),
    '364': ('cortile', .34, .95, 1.4, 'cortile', False, 'il cortile dall\'alto con la palma'),
    '365': ('cortile', .4, .95, 1.3, 'cortile', False, 'il giardino del cortile dall\'alto'),
    '379': ('cortile', .46, .95, 1.4, 'cortile', False, 'gli alberi del cortile dalla finestra'),
    '322': ('cortile', .53, .95, 1.3, 'cortile', False, 'la palma e la facciata'),
    '318': ('cortile', .59, .95, 1.4, 'cortile', False, 'il cortile e la facciata'),
    '316': ('cortile', .64, .95, 1.3, 'cortile', False, 'il cortile sotto la pioggia, dall\'alto'),
    '319': ('cortile', .7, .95, 1.4, 'cortile', False, 'la facciata sul cortile vista dall\'alto'),
    '177': ('cortile', .78, .95, 1.3, 'cortile', False, 'il cortile e gli alberi dalla ringhiera'),
}
# guardate e lasciate fuori: scattate nel cortile a terra, non da questo piano
FUORI = {'384': 'la facciata vista dal cortile, a terra', '317': 'le radici di un albero, nel cortile a terra'}


def main():
    foto = {i: {'gruppo': g, 't': t, 'lato': l, 'h': h, 'guarda': gu, 'preciso': p, 'nota': n}
            for i, (g, t, l, h, gu, p, n) in FOTO.items()}
    json.dump({'descrizione': 'Le foto scattate nel corridoio del chiostro (primo piano) ricostruito in 3D. '
                              't: punto lungo l\'anello (0-1); lato: -1 muro esterno, +1 arcate; h: altezza (1 = occhi); '
                              'guarda: avanti/indietro/muro/cortile; preciso: punto riconosciuto o solo stimato.',
               'foto': foto, 'fuori': FUORI}, open(USCITA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    gruppi = {}
    for f in foto.values(): gruppi[f['gruppo']] = gruppi.get(f['gruppo'], 0) + 1
    print(f'  {len(foto)} foto ({", ".join(f"{n} {g}" for g, n in gruppi.items())}), '
          f'{sum(f["preciso"] for f in foto.values())} con il punto preciso -> {USCITA}')


if __name__ == '__main__':
    main()
