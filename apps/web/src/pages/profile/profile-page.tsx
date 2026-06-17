import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rollapp/ui/components/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rollapp/ui/components/card"
import { Avatar, AvatarFallback } from "@rollapp/ui/components/avatar"
import { Badge } from "@rollapp/ui/components/badge"
import { Button } from "@rollapp/ui/components/button"
import { Switch } from "@rollapp/ui/components/switch"
import { Separator } from "@rollapp/ui/components/separator"
import { Label } from "@rollapp/ui/components/label"
import {
  User,
  Shield,
  Bell,
  Smartphone,
  LogOut,
  ChevronRight,
} from "lucide-react"

export function ProfilePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      {/* Шапка профиля */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg font-semibold bg-primary text-primary-foreground">
            МИ
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold">Михаил И.</h1>
          <p className="text-sm text-muted-foreground">+7 900 •••-12-34</p>
          <Badge variant="secondary" className="mt-1 w-fit">
            Полная идентификация
          </Badge>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="personal" className="flex-1">
            <User className="mr-2 h-4 w-4" />
            Данные
          </TabsTrigger>
          <TabsTrigger value="security" className="flex-1">
            <Shield className="mr-2 h-4 w-4" />
            Безопасность
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex-1">
            <Bell className="mr-2 h-4 w-4" />
            Уведомления
          </TabsTrigger>
        </TabsList>

        {/* Персональные данные */}
        <TabsContent value="personal" className="mt-4 flex flex-col gap-4">
          <PersonalDataCard />
          <DevicesCard />
        </TabsContent>

        {/* Безопасность */}
        <TabsContent value="security" className="mt-4 flex flex-col gap-4">
          <SecurityCard />
        </TabsContent>

        {/* Уведомления */}
        <TabsContent value="notifications" className="mt-4 flex flex-col gap-4">
          <NotificationsCard />
        </TabsContent>
      </Tabs>

      <Separator />

      <Button variant="ghost" className="w-full justify-start gap-2 text-destructive">
        <LogOut className="h-4 w-4" />
        Выйти из аккаунта
      </Button>
    </div>
  )
}

function PersonalDataCard() {
  const fields = [
    { label: "ФИО", value: "Михаил Иванов" },
    { label: "Телефон", value: "+7 900 123-45-67" },
    { label: "Email", value: "mikhail@example.com" },
    { label: "Паспорт", value: "12 34 ••••••" },
    { label: "ИНН", value: "••••••••••••" },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Персональные данные</CardTitle>
        <CardDescription className="text-xs">Ваша основная информация</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center justify-between">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function DevicesCard() {
  const devices = [
    { name: "iPhone 15 Pro", lastActive: "Сейчас", current: true },
    { name: "MacBook Pro", lastActive: "2 часа назад", current: false },
    { name: "iPad Air", lastActive: "Вчера", current: false },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Устройства</CardTitle>
        <CardDescription className="text-xs">Активные сессии</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {devices.map((device) => (
            <div key={device.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{device.name}</p>
                  <p className="text-xs text-muted-foreground">{device.lastActive}</p>
                </div>
              </div>
              {device.current ? (
                <Badge variant="secondary" className="text-xs">Это устройство</Badge>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs text-destructive">
                  Завершить
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SecurityCard() {
  const items = [
    { label: "Двухфакторная аутентификация", description: "SMS-код при входе", enabled: true },
    { label: "Биометрия", description: "Face ID / отпечаток", enabled: false },
    { label: "Подтверждение платежей", description: "PIN-код при переводах", enabled: true },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Безопасность</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <Label className="text-sm font-medium">{item.label}</Label>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Switch defaultChecked={item.enabled} />
            </div>
          ))}
          <Separator />
          <Button variant="outline" className="w-full justify-between">
            <span>Сменить пароль</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function NotificationsCard() {
  const items = [
    { label: "Push-уведомления", description: "Мгновенные уведомления на устройстве", enabled: true },
    { label: "SMS-уведомления", description: "Важные операции по SMS", enabled: true },
    { label: "Email-рассылка", description: "Новости и акции", enabled: false },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Уведомления</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <Label className="text-sm font-medium">{item.label}</Label>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Switch defaultChecked={item.enabled} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
