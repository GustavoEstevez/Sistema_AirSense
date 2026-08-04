from django.urls import path
from . import views

app_name = 'dashboard'

urlpatterns = [
    path('',              views.home,           name='home'),
    path('data/',         views.data,           name='data'),
    path('sensor/datos/', views.recibir_datos,  name='recibir_datos'),
]