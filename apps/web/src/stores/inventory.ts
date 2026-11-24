import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getVehicleModel, type VehicleModel } from '@/services/inventory'

/**
 * Paso 9: store opcional de inventario.
 *
 * Cachea el modelo de motocicleta seleccionado durante la sesión para no
 * re-pedirlo ni perder la selección al navegar. No cachea stock, garantías
 * ni compatibilidad (datos vivos). El caché es en memoria: muere con la
 * pestaña, no se persiste.
 */
export const useInventoryStore = defineStore('inventory', () => {
  const selectedModel = ref<VehicleModel | null>(null)

  const hasSelectedModel = computed(() => selectedModel.value !== null)

  /** Guarda la selección hecha desde la vista. */
  function selectModel(model: VehicleModel): void {
    selectedModel.value = model
  }

  /** Devuelve el modelo cacheado o lo consulta por id una sola vez por sesión. */
  async function ensureModel(id: string): Promise<VehicleModel> {
    if (selectedModel.value && selectedModel.value.id === id) return selectedModel.value
    const model = await getVehicleModel(id)
    selectedModel.value = model
    return model
  }

  function clearSelectedModel(): void {
    selectedModel.value = null
  }

  return { selectedModel, hasSelectedModel, selectModel, ensureModel, clearSelectedModel }
})