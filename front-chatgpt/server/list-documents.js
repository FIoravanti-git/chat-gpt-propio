const fs = require('fs')
const path = require('path')

const documentsDir = '/opt/proyectos/chat-gpt-propio/ia-nuevo/docs/documentos/'

function listDocuments() {
  try {
    const files = fs.readdirSync(documentsDir)
    return files.map(file => ({
      name: file,
      path: path.join(documentsDir, file)
    }))
  } catch (error) {
    console.error('Error al leer directorio:', error)
    return []
  }
}

// Si se ejecuta directamente, exportar la lista
if (require.main === module) {
  console.log(JSON.stringify(listDocuments()))
}

module.exports = { listDocuments }
