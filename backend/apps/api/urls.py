from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.api import views_animals as animals
from apps.api import views_core as core
from apps.api import views_finance as finance
from apps.api import views_reports as reports

router = DefaultRouter()
router.register("farms", core.FarmViewSet, basename="farm")
router.register("catalog-types", core.CatalogTypeViewSet, basename="catalog-type")
router.register("catalog", core.CatalogItemViewSet, basename="catalog")
router.register("fields", core.FieldDefinitionViewSet, basename="field")
router.register("roles", core.RoleViewSet, basename="role")
router.register("members", core.MembershipViewSet, basename="member")
router.register("audit", core.AuditLogViewSet, basename="audit")

router.register("animals", animals.AnimalViewSet, basename="animal")
router.register("births", animals.BirthViewSet, basename="birth")
router.register("weights", animals.WeightViewSet, basename="weight")
router.register("health", animals.HealthViewSet, basename="health")

router.register("accounts", finance.AccountViewSet, basename="account")
router.register("entries", finance.JournalEntryViewSet, basename="entry")
router.register("approval-rules", finance.ApprovalRuleViewSet, basename="approval-rule")
router.register("parties", finance.PartyViewSet, basename="party")
router.register("purchases", finance.PurchaseViewSet, basename="purchase")
router.register("sales", finance.SaleViewSet, basename="sale")

urlpatterns = [
    path("health/", core.health, name="health"),
    path("auth/login/", core.LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("auth/me/", core.MeView.as_view(), name="me"),
    path("auth/switch-farm/", core.SwitchFarmView.as_view(), name="switch-farm"),
    path("permissions/", core.PermissionListView.as_view(), name="permissions"),

    path("theme/", core.ThemeView.as_view(), name="theme"),
    path("theme/draft/", core.ThemeDraftView.as_view(), name="theme-draft"),
    path("theme/publish/", core.ThemePublishView.as_view(), name="theme-publish"),
    path("theme/reset/", core.ThemeResetView.as_view(), name="theme-reset"),

    path("ops/expense/", finance.ExpenseCommandView.as_view(), name="op-expense"),
    path("ops/income/", finance.IncomeCommandView.as_view(), name="op-income"),
    path("ops/transfer/", finance.TransferCommandView.as_view(), name="op-transfer"),
    path("ops/capital/", finance.CapitalView.as_view(), name="op-capital"),
    path("ops/withdraw/", finance.WithdrawView.as_view(), name="op-withdraw"),
    path("ops/settle/", finance.SettleView.as_view(), name="op-settle"),
    path("ops/collect/", finance.CollectView.as_view(), name="op-collect"),
    path("ops/death/", finance.DeathCommandView.as_view(), name="op-death"),
    path("ops/opening-balances/", finance.OpeningBalanceView.as_view(), name="op-opening"),

    path("reports/dashboard/", reports.DashboardView.as_view(), name="dashboard"),
    path("reports/trial-balance/", reports.TrialBalanceView.as_view(), name="trial-balance"),
    path("reports/profit-loss/", reports.ProfitLossView.as_view(), name="profit-loss"),
    path("reports/cash-flow/", reports.CashFlowView.as_view(), name="cash-flow"),
    path("reports/categories/", reports.CategoryReportView.as_view(), name="categories"),
    path("reports/animals/", reports.AnimalReportView.as_view(), name="animal-report"),

    path("", include(router.urls)),
]
