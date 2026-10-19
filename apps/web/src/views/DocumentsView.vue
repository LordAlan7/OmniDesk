<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../services/api'
import { clearSession, hasPermission, sessionUser } from '../services/session'
import { getCategories, listDocuments, getDocument, uploadDocument, editDocument, publishDocument, downloadDocument } from '../services/documents'
import type { Category, DocumentMetadata, KnowledgeDocument } from '../services/documents'
const router = useRouter()
const categories = ref<Category[]>([])
const documents = ref<KnowledgeDocument[]>([])
const selected = ref<KnowledgeDocument | null>(null)
const total = ref(0)
const page = ref(1)
const search = ref('')
const category = ref('')
const status = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const loaded = ref(false)
const formOpen = ref(false)
const editing = ref(false)
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const fieldErrors = ref<Record<string,string>>({})
const emptyForm = (): DocumentMetadata => ({title:'',description:'',categoryId:0,source:'',sourceReference:null,edition:null,documentDate:null})
const form = ref<DocumentMetadata>(emptyForm())
const publication = ref<KnowledgeDocument['status']>('draft')
const allowedRoles = ref<string[]>([])
const roles = ['Employee','Technician','Service Advisor','Manager','Administrator']
const canCreate = computed(() => hasPermission('knowledge:create'))
const canPublish = computed(() => hasPermission('knowledge:publish'))
const canEdit = computed(() => selected.value?.status === 'draft' && hasPermission('knowledge:update') &&
  (selected.value.createdBy === sessionUser.value?.id || canPublish.value))
const statusLabel = (value: string) => ({draft:'Borrador',published:'Publicado',retired:'Retirado'}[value] || value)
const dateLabel = (value: string) => new Date(value).toLocaleString('es-MX')
async function failure(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : 'No se pudo completar la operación.'
  if (cause instanceof ApiError) {
    if (Array.isArray(cause.details)) for (const detail of cause.details) {
      if (detail && typeof detail.field === 'string' && typeof detail.message === 'string') fieldErrors.value[detail.field]=detail.message
    }
    if (cause.status === 401) { clearSession(); await router.replace('/login') }
  }
}
async function load() {
  const query = new URLSearchParams({page:String(page.value),limit:'10',search:search.value})
  if (category.value) query.set('categoryId',category.value)
  if (status.value) query.set('status',status.value)
  const result = await listDocuments(query)
  documents.value=result.data; total.value=result.meta?.total ?? 0; loaded.value=true
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value=true; error.value=''; notice.value=''; fieldErrors.value={}
  try { await action() } catch(cause) { await failure(cause) } finally { busy.value=false }
}
function searchDocuments() { page.value=1; void run(load) }
function changePage(delta: number) { page.value+=delta; void run(load) }
function chooseFile(event: Event) { file.value=(event.target as HTMLInputElement).files?.[0] ?? null }
function startCreate() {
  selected.value=null; form.value=emptyForm(); editing.value=false; formOpen.value=true; file.value=null; fieldErrors.value={}; error.value=''; notice.value=''
}
function startEdit() {
  if (!selected.value) return
  const d=selected.value
  form.value={title:d.title,description:d.description,categoryId:d.categoryId,source:d.source,sourceReference:d.sourceReference,edition:d.edition,documentDate:d.documentDate}
  editing.value=true; formOpen.value=true; fieldErrors.value={}
}
function setSelected(doc: KnowledgeDocument) {
  selected.value=doc; publication.value=doc.status; allowedRoles.value=[...doc.accessRoles]
}
function openDocument(id: number) {
  formOpen.value=false
  void run(async () => { selected.value=null; setSelected((await getDocument(id)).data) })
}
function save() {
  void run(async () => {
    if (editing.value && selected.value) {
      setSelected((await editDocument(selected.value,form.value)).data)
    } else {
      if (!file.value) { fieldErrors.value.file='Selecciona un PDF.'; throw new Error('Selecciona un PDF.') }
      if (file.value.size > 10*1024*1024 || !file.value.name.toLowerCase().endsWith('.pdf')) {
        fieldErrors.value.file='Selecciona un PDF de hasta 10 MB.'; throw new Error(fieldErrors.value.file)
      }
      setSelected((await uploadDocument(form.value,file.value)).data)
    }
    formOpen.value=false; file.value=null
    if (fileInput.value) fileInput.value.value=''
    await load(); notice.value='Documento guardado.'
  })
}
function publish() {
  void run(async () => {
    if (!selected.value) return
    setSelected((await publishDocument(selected.value,publication.value,allowedRoles.value)).data)
    await load(); notice.value='Estado y acceso actualizados.'
  })
}
onMounted(() => { void run(async () => { categories.value=(await getCategories()).data; await load() }) })
</script>

<template>
  <main class="library" :aria-busy="busy">
    <header>
      <div><span class="brand">OmniDesk / Biblioteca de conocimiento</span><h1>Manuales y documentación</h1></div>
      <nav aria-label="Navegación"><RouterLink v-if="hasPermission('users:read:list')" to="/users">Usuarios</RouterLink>
        <button :disabled="busy" @click="clearSession(); router.replace('/login')">Cerrar sesión</button></nav>
    </header>
    <p>Consulta documentación técnica y su procedencia. Los documentos nuevos se guardan como borradores.</p>
    <p v-if="busy" role="status">Procesando solicitud…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <form class="filters" @submit.prevent="searchDocuments">
      <label>Buscar<input v-model="search" maxlength="200" placeholder="Título, descripción, categoría o fuente" /></label>
      <label>Categoría<select v-model="category"><option value="">Todas</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
      <label>Estado<select v-model="status"><option value="">Todos los accesibles</option><option value="draft">Borrador</option><option value="published">Publicado</option><option value="retired">Retirado</option></select></label>
      <button :disabled="busy">Buscar</button><button v-if="canCreate" type="button" :disabled="busy" @click="startCreate">Cargar documento</button>
    </form>
    <div class="columns">
      <section aria-label="Documentos">
        <p v-if="loaded && !documents.length && !error">{{ search || category || status ? 'Sin resultados para estos filtros.' : 'No hay documentos disponibles para tu cuenta.' }}</p>
        <article v-for="doc in documents" :key="doc.id" class="document">
          <span class="badge">{{ statusLabel(doc.status) }}</span>
          <h2><button class="title" :disabled="busy" @click="openDocument(doc.id)">{{ doc.title }}</button></h2>
          <p>{{ doc.description }}</p><p><strong>Fuente:</strong> {{ doc.source }}</p>
          <small>{{ doc.categoryName }} · Edición: {{ doc.edition || 'No indicada' }} · {{ (doc.sizeBytes/1024).toFixed(0) }} KB</small>
        </article>
        <footer v-if="loaded"><button :disabled="busy || page <= 1" @click="changePage(-1)">Anterior</button>
          <span>Página {{ page }} · {{ total }} documentos</span><button :disabled="busy || page*10 >= total" @click="changePage(1)">Siguiente</button></footer>
      </section>
      <section v-if="formOpen" class="panel" aria-label="Formulario documental">
        <h2>{{ editing ? 'Editar metadatos' : 'Cargar PDF' }}</h2>
        <form @submit.prevent="save">
          <fieldset :disabled="busy">
            <label>Título *<input v-model="form.title" required maxlength="200" /><small class="error-text">{{ fieldErrors.title }}</small></label>
            <label>Descripción *<textarea v-model="form.description" required maxlength="4000" rows="3" /><small class="error-text">{{ fieldErrors.description }}</small></label>
            <label>Categoría *<select v-model="form.categoryId" required><option :value="0" disabled>Selecciona una categoría</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select><small class="error-text">{{ fieldErrors.categoryId }}</small></label>
            <label>Fuente o entidad emisora *<input v-model="form.source" required maxlength="300" placeholder="Fabricante, autor u organización" /><small class="error-text">{{ fieldErrors.source }}</small></label>
            <small>Si no puede confirmarse, escribe “Fuente no confirmada”. Quien lo carga se registra por separado.</small>
            <label>Referencia de origen<input v-model="form.sourceReference" maxlength="1000" placeholder="Código, URL o referencia interna" /><small class="error-text">{{ fieldErrors.sourceReference }}</small></label>
            <label>Edición documental<input v-model="form.edition" maxlength="100" /><small class="error-text">{{ fieldErrors.edition }}</small></label>
            <label>Fecha documental<input v-model="form.documentDate" type="date" /><small class="error-text">{{ fieldErrors.documentDate }}</small></label>
            <label v-if="!editing">Archivo PDF *<input ref="fileInput" type="file" accept=".pdf,application/pdf" required @change="chooseFile" /><small>Hasta 10 MB. Sin cifrado ni contenido activo. Ante un error, revisa si el archivo sigue seleccionado.</small><small class="error-text">{{ fieldErrors.file }}</small></label>
            <div class="actions"><button type="submit">{{ busy ? 'Guardando…' : 'Guardar' }}</button><button type="button" @click="formOpen=false">Cancelar</button></div>
          </fieldset>
        </form>
      </section>
      <section v-else-if="selected" class="panel" aria-label="Detalle documental">
        <h2>{{ selected.title }}</h2><p>{{ selected.description }}</p>
        <dl>
          <dt>Fuente / procedencia</dt><dd>{{ selected.source }}</dd>
          <dt>Referencia de origen</dt><dd>{{ selected.sourceReference || 'No indicada' }}</dd>
          <dt>Edición / fecha documental</dt><dd>{{ selected.edition || 'No indicada' }} / {{ selected.documentDate || 'No indicada' }}</dd>
          <dt>Cargado por</dt><dd>{{ selected.uploadedBy }} · {{ dateLabel(selected.createdAt) }}</dd>
          <dt>Última actualización</dt><dd>{{ dateLabel(selected.updatedAt) }}</dd>
          <dt>Categoría / estado</dt><dd>{{ selected.categoryName }} / {{ statusLabel(selected.status) }}</dd>
          <dt>Archivo</dt><dd>{{ selected.originalName }}</dd>
          <dt>Identificador / versión interna</dt><dd>{{ selected.id }} / {{ selected.versionId }}</dd>
          <dt>Acceso publicado</dt><dd>{{ selected.accessRoles.join(', ') || 'Todos los roles con permiso de lectura' }}</dd>
          <dt>Uso por IA</dt><dd>Sin autorización para IA</dd>
        </dl>
        <div class="actions"><button :disabled="busy" @click="run(async () => { if(selected) await downloadDocument(selected) })">Descargar PDF</button>
          <button v-if="canEdit" :disabled="busy" @click="startEdit">Editar metadatos</button></div>
        <form v-if="canPublish" class="publication" @submit.prevent="publish">
          <fieldset :disabled="busy"><legend>Publicación y acceso</legend>
            <label>Estado<select v-model="publication"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="retired">Retirado</option></select></label>
            <p>Sin roles seleccionados: todos los roles con permiso de lectura. Borradores: autor y quienes publican. Retirados: quienes publican.</p>
            <label v-for="role in roles" :key="role" class="check"><input v-model="allowedRoles" type="checkbox" :value="role" />{{ role }}</label>
            <button type="submit">Guardar estado y acceso</button>
          </fieldset>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.library{min-height:100vh;padding:32px;max-width:1500px;margin:auto;font-family:Arial,sans-serif;color:#182338;background:#f8f9ff}header,nav,.filters,.actions,footer{display:flex;gap:16px;align-items:center;flex-wrap:wrap}header{justify-content:space-between}.brand{color:#2457d6;font-weight:700}h1{font-size:28px}h2{font-size:20px}p{line-height:1.5}.filters{background:white;padding:20px;border:1px solid #dce3ee;border-radius:12px;margin:24px 0;align-items:end}.filters label:first-child{flex:1;min-width:200px}.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,1fr);gap:24px}.document,.panel{padding:24px;background:white;border:1px solid #dce3ee;border-radius:12px;margin-bottom:16px;overflow-wrap:anywhere}.panel{align-self:start}label{display:grid;gap:8px;margin-bottom:14px;font-weight:600}small{font-weight:400;color:#536071;line-height:1.5}input,select,textarea{padding:10px;border:1px solid #aab9cc;border-radius:6px;font:inherit;width:100%}button{padding:11px 15px;border:1px solid #2457d6;background:#2457d6;color:white;border-radius:7px;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}.title{padding:0;background:transparent;color:#2457d6;border:0;text-align:left;font-weight:700}.badge{font-size:12px;background:#edf1fb;padding:5px 8px;border-radius:5px}.error,.notice{padding:14px;border-radius:8px}.error{color:#8f1818;background:#fff0f0}.notice{color:#19603c;background:#eaf8ef}.error-text{color:#a52121}fieldset{border:0;padding:0;margin:0}dt{font-weight:700;margin-top:16px}dd{margin:6px 0}.publication{border-top:1px solid #dce3ee;margin-top:24px;padding-top:20px}.check{display:flex;align-items:center;font-weight:400}.check input{width:auto}footer{justify-content:space-between}a{color:#2457d6}input:focus,button:focus,select:focus,textarea:focus{outline:2px solid #2457d6;outline-offset:3px}@media(max-width:850px){.columns{grid-template-columns:1fr}.library{padding:18px}.panel{grid-row:1}}
</style>
