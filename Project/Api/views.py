from django.shortcuts import render, redirect

def Home(request):
    return render(request, 'Home.html')

def HomeAI(request):
    return render(request, 'HomeAI.html')

def dashboard(request):
    return redirect('dashboard:home')

def historial(request):
    return render(request, 'historial.html')

def documentacion(request):
    return render(request, 'Pages/documentacion.html')