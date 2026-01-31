import { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import { IncomingMessage, ServerResponse } from 'http'

export function listDocumentsPlugin(): Plugin {
  return {
    name: 'list-documents',
    configureServer(server) {
      // Endpoint para listar documentos - ahora redirige al backend que maneja multi-tenancy
      server.middlewares.use('/api/list-documents', async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method === 'GET') {
          try {
            // Obtener el token de autenticación del header
            const authHeader = req.headers.authorization || req.headers['x-auth-token']
            const token = authHeader?.toString().replace('Bearer ', '') || authHeader?.toString()
            
            // Redirigir al backend de Quivr que maneja multi-tenancy correctamente
            const axios = require('axios')
            const QUIVR_API = 'http://31.220.102.254:8000'
            
            const response = await axios.get(`${QUIVR_API}/documents`, {
              headers: {
                'Authorization': token ? `Bearer ${token}` : undefined,
                'X-Auth-Token': token || undefined
              },
              timeout: 5000
            })
            
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(response.data))
          } catch (error: any) {
            res.statusCode = error.response?.status || 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ 
              error: error.response?.data?.detail || error.message || 'Error al listar documentos' 
            }))
          }
        } else {
          next()
        }
      })

      // Endpoint para subir documento desde ruta del sistema
      server.middlewares.use('/api/upload-document', async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => {
            body += chunk.toString()
          })
          req.on('end', async () => {
            try {
              const { filePath } = JSON.parse(body)
              if (!filePath || !fs.existsSync(filePath)) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Archivo no encontrado' }))
                return
              }

              // Leer el archivo
              const fileBuffer = fs.readFileSync(filePath)
              const fileName = path.basename(filePath)
              
              // Crear FormData para enviar a Quivr
              const FormData = require('form-data')
              const formData = new FormData()
              formData.append('file', fileBuffer, fileName)

              // Subir a Quivr usando el endpoint correcto
              const axios = require('axios')
              const QUIVR_API = 'http://31.220.102.254:8000'
              
              await axios.post(`${QUIVR_API}/documents/upload`, formData, {
                headers: formData.getHeaders(),
                timeout: 120000
              })

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (error: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: error.message || 'Error al subir documento' }))
            }
          })
        } else {
          next()
        }
      })
    }
  }
}
