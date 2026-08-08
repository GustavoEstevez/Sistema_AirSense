from django.contrib import admin
from django.urls import path, include
from Api.views import Home, HomeAI, historial, documentacion

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', Home, name='Home'),
    path('ai/', HomeAI, name='HomeAI'),
    path('dashboard/', include('core.urls', namespace='dashboard')),
    path('historial/', historial, name='historial'),
    path('documentacion/',documentacion, name='documentacion'),
]