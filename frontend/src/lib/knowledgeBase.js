import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

export const ADMIN_EMAIL = 'joserodolquinbo1997@gmail.com'
const COLLECTION = 'knowledge_base_items'

export const DEFAULT_QUERIES = [
  'Muestrame los primeros 100 registros de [tabla]',
  'Busca en [tabla] donde [columna] sea [valor]',
  'Cuenta cuantos registros tiene [tabla]',
  'Muestrame valores unicos de [columna] en [tabla]',
  'Actualiza [tabla] pon [columna] a [valor] donde [columna2] sea [valor2]',
  'Reemplaza en [tabla] el valor [viejo] por [nuevo] en [columna]',
  'Vaciar columna [columna] en [tabla]',
  'Cruza [tablaA] con [tablaB] por [columna_id]',
  'Consolida [tablaA] con [tablaB]',
  'Ordena [tabla] por [columna] de mayor a menor',
  'Duplicados en [columna] de [tabla]',
  'Nulos en [columna] de [tabla]',
  'Agrega columna [nombre] de tipo VARCHAR a [tabla]',
  'Elimina columna [columna] de [tabla]',
  'Renombra columna [actual] a [nueva] en [tabla]',
  'Reordena columnas de [tabla]: col1, col2, col3',
]

export function isAdminUser(email) {
  return (email || '').toLowerCase().trim() === ADMIN_EMAIL
}

function normalizeDoc(id, raw) {
  return {
    id,
    text: raw.text || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdBy: raw.createdBy || 'admin',
    createdAtMs: raw.createdAt?.toMillis?.() || 0,
    updatedAtMs: raw.updatedAt?.toMillis?.() || 0,
  }
}

export function subscribeKnowledgeBase(onItems, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => normalizeDoc(d.id, d.data()))
      onItems(items)
    },
    (err) => {
      onError?.(err)
      onItems([])
    }
  )
}

export async function createKnowledgeItem({ text, tags = [], createdBy }) {
  const clean = (text || '').trim()
  if (!clean) throw new Error('La instruccion no puede estar vacia.')
  await addDoc(collection(db, COLLECTION), {
    text: clean,
    tags,
    createdBy: createdBy || 'admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function removeKnowledgeItem(id) {
  await deleteDoc(doc(db, COLLECTION, id))
}
