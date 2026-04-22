import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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
  'Actualiza toda la columna [columna] a [valor] en [tabla]',
  'Actualiza toda la columna [columna] a NULL en [tabla]',
  'Actualiza masivo [tabla] columna [columna_objetivo] por [columna_clave] con: clave1=>valor1; clave2=>valor2; clave3=>valor3',
  'Actualiza masivo [tabla] columna [columna_objetivo] por [columna_clave] con: 1=>A; 2=>B; 3=>C; 4=>D',
  'Actualiza masivo clientes columna estado por id con: 1001=>activo; 1002=>inactivo; 1003=>activo',
  'Reemplaza en [tabla] el valor [viejo] por [nuevo] en [columna]',
  'Reemplaza todos los datos de la columna [columna] por [valor] en [tabla]',
  'Reemplaza en [tabla] el valor [viejo] por [nuevo] en [columna] donde [columna2] sea [valor2]',
  'Vaciar columna [columna] en [tabla]',
  'Actualizar [tabla] solo filas donde [columna] sea [valor] y poner [columna_objetivo] a [nuevo_valor]',
  'Elimina registros de [tabla] donde [columna] sea [valor]',
  'Elimina registros de [tabla] donde [columna] este en (valor1, valor2, valor3)',
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
  if (!isAdminUser(createdBy)) {
    throw new Error('Solo el usuario administrador puede crear instrucciones globales.')
  }
  const ref = await addDoc(collection(db, COLLECTION), {
    text: clean,
    tags,
    createdBy: createdBy || 'admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateKnowledgeItem({ id, text, tags, updatedBy }) {
  const clean = (text || '').trim()
  if (!id) throw new Error('Identificador de instruccion invalido.')
  if (!clean) throw new Error('La instruccion no puede estar vacia.')
  if (!isAdminUser(updatedBy)) {
    throw new Error('Solo el usuario administrador puede editar instrucciones globales.')
  }
  const payload = {
    text: clean,
    updatedAt: serverTimestamp(),
  }
  if (Array.isArray(tags)) payload.tags = tags
  await updateDoc(doc(db, COLLECTION, id), payload)
}

export async function removeKnowledgeItem(id, removedBy) {
  if (!id) throw new Error('Identificador de instruccion invalido.')
  if (!isAdminUser(removedBy)) {
    throw new Error('Solo el usuario administrador puede eliminar instrucciones globales.')
  }
  await deleteDoc(doc(db, COLLECTION, id))
}
