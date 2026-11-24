import { api, apiPage } from '@/api/http'

/**
 * Servicio de inventario (contrato v1.0, §3 y §4).
 *
 * Solo lectura sobre el cliente HTTP único (`api/http.ts`): sin fetch propio,
 * sin token propio y sin manejo de errores propio. Los estados de carga, vacío
 * y error se resuelven en las vistas con el `ApiError` ya clasificado
 * (`kind`: 'network' | 'server' | 'client') que lanza ese cliente.
 *
 * Rutas y campos son los que el backend de soporte sirve realmente (módulo
 * inventory, permiso INVENTORY_READ). Los precios nunca llegan aquí (§4).
 */

export type VehicleStatus = 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'RETURNED'
export type VehicleEventType = 'ENTRY' | 'SALE' | 'RETURN' | 'TRANSFER' | 'WARRANTY_CLAIM'
export type StockLevel = 'AVAILABLE' | 'LOW' | 'OUT'

/** §4 Vehicle (sin precio ni datos de venta). */
export interface Vehicle {
  id: string
  vin: string
  brand: string
  model: string
  modelId: string | null
  year: number
  status: VehicleStatus
  locationId: string
  modelStock: number
}

export interface VehicleEvent {
  id: string
  type: VehicleEventType
  occurredAt: string
  locationId: string | null
}

/** §4 Warranty: sin notas de resolución, resolvedBy ni montos. */
export interface WarrantyInfo {
  status: 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'NOT_APPLICABLE'
  startDate: string | null
  expiresAt: string | null
  daysRemaining: number | null
  coverage: string | null
  voidedReason: string | null
  openClaims: number
}

export interface Product {
  id: string
  sku: string
  name: string
  brand: string | null
  category: { id: string; name: string } | null
  status: string
  codes: { value: string; format?: string | null; kind?: string | null }[]
}

/** §4 CompatibleProduct: campos de Product + existencias calculadas. */
export interface CompatibleProduct extends Product {
  stockTotal: number
  stockLevel: StockLevel
}

/** §4 Stock: existencias por ubicación. */
export interface StockByLocation {
  location: { id: string; name: string; code?: string; type?: string }
  quantity: number
  level: StockLevel
}

export interface StockInfo {
  productId: string
  total: number
  locations: StockByLocation[]
}

export interface VehicleModel {
  id: string
  brand: string
  model: string
  yearFrom: number | null
  yearTo: number | null
  engineCc: number | null
  status: string
}

/** §5: permiso que habilita las secciones de inventario en la interfaz. */
export const INVENTORY_READ = 'inventory:read'

/** §3/§10: filtros de GET /inventory/products (los que el backend valida). */
export interface ProductFilters {
  search?: string
  categoryId?: string
  page?: number
  limit?: number
}

/** §10: el VIN se normaliza a mayúsculas antes de enviarlo. */
export function getVehicleByVin(vin: string): Promise<Vehicle> {
  return api<Vehicle>(`/inventory/vehicles/by-vin/${vin.trim().toUpperCase()}`)
}

export function getVehicle(id: string): Promise<Vehicle> {
  return api<Vehicle>(`/inventory/vehicles/${id}`)
}

export function getVehicleEvents(vehicleId: string): Promise<VehicleEvent[]> {
  return api<VehicleEvent[]>(`/inventory/vehicles/${vehicleId}/events`)
}

export function getWarranty(vehicleId: string): Promise<WarrantyInfo> {
  return api<WarrantyInfo>(`/inventory/vehicles/${vehicleId}/warranty`)
}

/** GET /inventory/vehicles/:id/warranty — estado de la garantía (contrato v1.0, §4). */
export function getVehicleWarranty(vehicleId: string): Promise<WarrantyInfo> {
  return api<WarrantyInfo>(`/inventory/vehicles/${vehicleId}/warranty`)
}

export function getCompatibleProducts(vehicleId: string): Promise<CompatibleProduct[]> {
  return api<CompatibleProduct[]>(`/inventory/vehicles/${vehicleId}/compatible-products`)
}

/** Listado paginado de refacciones: apiPage devuelve data + meta. */
export function listProducts(filters: ProductFilters = {}) {
  const query = new URLSearchParams()
  if (filters.search) query.set('search', filters.search)
  if (filters.categoryId) query.set('categoryId', filters.categoryId)
  if (filters.page !== undefined) query.set('page', String(filters.page))
  if (filters.limit !== undefined) query.set('limit', String(filters.limit))
  const qs = query.toString()
  return apiPage<Product[]>(`/inventory/products${qs ? `?${qs}` : ''}`)
}

export function getProductByCode(value: string): Promise<Product> {
  return api<Product>(`/inventory/products/by-code/${encodeURIComponent(value)}`)
}

export function getProduct(id: string): Promise<Product> {
  return api<Product>(`/inventory/products/${id}`)
}

export function getProductStock(productId: string): Promise<StockInfo> {
  return api<StockInfo>(`/inventory/products/${productId}/stock`)
}

export function listVehicleModels(): Promise<VehicleModel[]> {
  return api<VehicleModel[]>('/inventory/vehicle-models')
}

export function getVehicleModel(id: string): Promise<VehicleModel> {
  return api<VehicleModel>(`/inventory/vehicle-models/${id}`)
}