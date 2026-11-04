#!/usr/bin/env python3
"""
firestore_sync.py — Sincroniza los documentos de la ingesta v3 con Firestore.
SAAT Sequía v3 · GOAL · HN-M26-53765

  python firestore_sync.py bajar --dir ../_trabajo    # Firestore → JSON locales (inicio de cada corrida)
  python firestore_sync.py subir --dir ../_trabajo    # JSON locales → Firestore (fin de cada corrida)
  python firestore_sync.py subir --dir ../data/semilla  # CARGA INICIAL (semilla incluida en el repo)

Colecciones: v3_series/{id} (series) · v3_meta/resumen · v3_meta/estado
Credenciales (igual que v1/v2): FIREBASE_SERVICE_ACCOUNT (contenido JSON, secreto de
GitHub) o GOOGLE_APPLICATION_CREDENTIALS (ruta al .json). Sólo la cuenta de servicio
escribe; la web únicamente lee (ver firestore.rules).

Costo: cada corrida escribe ~120 documentos (cuota gratuita: 20 000 escrituras/día).
"""
import argparse, glob, json, os, sys
import saat_comun as C

META = {'resumen', 'estado'}


def db():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        sa = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
        if os.environ.get('FIRESTORE_EMULATOR_HOST'):          # pruebas locales con el emulador
            from google.auth.credentials import AnonymousCredentials
            from google.cloud import firestore as gfs
            return gfs.Client(project=os.environ.get('GCLOUD_PROJECT', 'satsequia-3b2a9'), credentials=AnonymousCredentials())
        if sa:
            cred = credentials.Certificate(json.loads(sa))
        elif os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.Certificate(os.environ['GOOGLE_APPLICATION_CREDENTIALS'])
        else:
            sys.exit('ERROR: define FIREBASE_SERVICE_ACCOUNT o GOOGLE_APPLICATION_CREDENTIALS')
        firebase_admin.initialize_app(cred)
    return firestore.client()


def bajar(d):
    cli = db(); os.makedirs(d, exist_ok=True); n = 0
    for snap in cli.collection(C.COL_SERIES).stream():
        json.dump(snap.to_dict(), open(C.ruta_doc(d, snap.id), 'w', encoding='utf-8'), ensure_ascii=False); n += 1
    for m in META:
        s = cli.collection(C.COL_META).document(m).get()
        if s.exists:
            json.dump(s.to_dict(), open(C.ruta_doc(d, m), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'Bajados {n} documentos de {C.COL_SERIES}')
    if n == 0:
        sys.exit('Firestore v3 vacío: haz la carga inicial (subir --dir data/semilla) o corre en modo baseline')


def subir(d):
    cli = db(); files = sorted(glob.glob(os.path.join(d, '*.json')))
    batch = cli.batch(); k = 0; tot = 0
    for p in files:
        doc_id = os.path.basename(p)[:-5]
        obj = json.load(open(p, encoding='utf-8'))
        ref = cli.collection(C.COL_META if doc_id in META else C.COL_SERIES).document(doc_id)
        batch.set(ref, obj); k += 1; tot += 1
        if k >= 40:                                   # lotes pequeños (límite 10 MiB por petición)
            batch.commit(); batch = cli.batch(); k = 0
    if k:
        batch.commit()
    print(f'Subidos {tot} documentos a Firestore')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('accion', choices=['bajar', 'subir'])
    ap.add_argument('--dir', default=C.SEMILLA)
    a = ap.parse_args()
    bajar(a.dir) if a.accion == 'bajar' else subir(a.dir)
