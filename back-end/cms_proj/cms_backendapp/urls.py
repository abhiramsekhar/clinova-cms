"""
cms_backendapp/urls.py
Main API URL dispatcher for cms_backendapp.
"""

from django.urls import include, path

urlpatterns = [
    path("auth/", include("cms_backendapp.urls_auth")),
]
