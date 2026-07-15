🏥 MediCMMS - Sistema de Gestión de Mantenimiento Clínico

MediCMMS es una aplicación web ligera y "Serverless" diseñada específicamente para Departamentos de Ingeniería Biomédica. Permite la gestión integral del inventario de equipos médicos, el control del mantenimiento preventivo/correctivo y la visualización de indicadores clave de rendimiento (KPIs) en tiempo real.

El sistema utiliza Google Sheets como base de datos, permitiendo una integración sencilla, gratuita y colaborativa.

✨ Características Principales

📊 Dashboard de Indicadores Avanzado (Dark Mode): Visualización de KPIs críticos (Cumplimiento de MP, MTTR, Tiempo de inactividad, Gasto presupuestal) con soporte para vistas mensuales y acumulado anual.

📋 Gestión de Inventario: Control de equipos divididos por origen (Propio, Comodato, Renta). Permite altas, ediciones y categorización de estatus (En Servicio / Fuera de Servicio).

🗓️ Calendario Preventivo Interactivo: * Cálculo automático de próximos mantenimientos basado en la frecuencia (Mensual, Trimestral, Anual, etc.).

Interfaz de un clic para marcar/desmarcar mantenimientos ejecutados.

Código de colores inteligente (Azul: Programado, Verde: Ejecutado, Rojo: Fuera de servicio).

Cálculo de porcentaje de cumplimiento en tiempo real con tolerancia de holgura (±1 mes).

🖨️ Reportes Listos para Imprimir: Estilos CSS optimizados para exportar el Dashboard y el Calendario a PDF o papel sin elementos de la interfaz innecesarios.

🛠️ Stack Tecnológico

Este proyecto está construido para ejecutarse directamente en el navegador sin necesidad de servidores o compilación local (Node.js):

Frontend: React 18 (Vía CDN), HTML5, Babel (Standalone).

Estilos: Tailwind CSS (Vía CDN).

Gráficas e Iconos: Chart.js, FontAwesome 6.

Procesamiento de Datos: PapaParse (para leer CSVs de KPIs).

Backend / Base de Datos: Google Apps Script (GAS) + Google Sheets.

🚀 Instalación y Configuración

Dado que es una aplicación que se ejecuta del lado del cliente, su alojamiento es sumamente sencillo. Se recomienda usar GitHub Pages.

Paso 1: Configurar Google Sheets (Base de Datos)

Crea un nuevo archivo de Google Sheets.

Crea tres hojas con los nombres exactos: Propio, Comodato y Renta.

Ve a Extensiones > Apps Script y pega el código backend correspondiente (Code.gs).

Haz clic en Implementar > Nueva implementación.

Selecciona el tipo "Aplicación Web".

Configuración: Ejecutar como "Tú", Quién tiene acceso "Cualquier persona".

Copia la URL de la aplicación web.

Paso 2: Configurar la URL de los Indicadores (CSV)

Crea una hoja de cálculo para tus indicadores mensuales.

Ve a Archivo > Compartir > Publicar en la web.

Selecciona la hoja específica y el formato CSV. Copia ese enlace.

Paso 3: Configurar el Frontend

Clona o descarga este repositorio.

Abre el archivo index.html.

Localiza la sección de CONFIGURACIÓN GLOBAL (aprox. línea 80).

Reemplaza las variables con tus enlaces:

const GOOGLE_SHEETS_WEBAPP_URL = "TU_URL_DE_APPS_SCRIPT_AQUI"; 
const GOOGLE_SHEET_CSV_URL = "TU_URL_CSV_PUBLICADO_AQUI";


Paso 4: Despliegue en GitHub Pages

Sube tu archivo index.html modificado a tu repositorio de GitHub.

Ve a la pestaña Settings > Pages.

En la sección "Build and deployment", elige la rama main.

¡Guarda! En un par de minutos, tu aplicación estará en vivo en tu URL de GitHub Pages.

📱 Uso Básico

Pestaña Dashboard: Selecciona el mes en la parte superior derecha para ver los indicadores específicos, o presiona "Vista Anual" para ver el consolidado. Al fondo verás el cálculo dinámico de cumplimiento preventivo.

Pestaña Inventario: Busca, filtra y edita equipos. Si cambias el estatus a "Fuera de Servicio", se requerirá un motivo.

Pestaña Calendarios: Visualiza el año en curso. Haz clic en las celdas azules para marcar los mantenimientos como ejecutados (se tornarán verdes con una palomita).

Desarrollado para optimizar la gestión de Ingeniería Clínica.
