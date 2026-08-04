from django.contrib import admin
from django.urls import path, include
from Api.views import Home, historial, documentacion

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', Home, name='Home'),
    path('dashboard/', include('core.urls', namespace='dashboard')),
    path('historial/', historial, name='historial'),
    path('documentacion/',documentacion, name='documentacion'),
]