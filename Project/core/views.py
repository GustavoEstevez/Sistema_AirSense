import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render

# Último dato recibido del ESP32
ultimo_dato = {}

def home(request):
    return render(request, 'core/dashboard.html')

def data(request):
    if not ultimo_dato:
        return JsonResponse({'error': 'Sin datos aún'}, status=503)
    return JsonResponse(ultimo_dato)

@csrf_exempt
def recibir_datos(request):
    global ultimo_dato
    if request.method == 'POST':
        try:
            datos = json.loads(request.body)
            ultimo_dato = {
                'temperatura': datos.get('temperatura'),
                'humedad':     datos.get('humedad'),
                'ruido':       datos.get('ruido'),
                'co2':         datos.get('co2'),
                'estado':      'ok',
            }
            return JsonResponse({'status': 'ok'})
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON inválido'}, status=400)
    return JsonResponse({'error': 'Método no permitido'}, status=405)