import { View, Text, TouchableOpacity } from 'react-native'
import { supabase } from '../services/supabase'

export default function Profile() {

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 22 }}>👤 Perfil</Text>

      <TouchableOpacity onPress={handleLogout} style={{ marginTop: 20 }}>
        <Text style={{ color: '#C2185B' }}>Sair</Text>
      </TouchableOpacity>
    </View>
  )
}