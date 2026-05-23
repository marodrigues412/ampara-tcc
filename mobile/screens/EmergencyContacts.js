import React, { useEffect, useState } from 'react'
import {
View,
Text,
StyleSheet,
TextInput,
TouchableOpacity,
ScrollView,
Alert,
Modal
} from 'react-native'

import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../services/supabase'
import { getPhoneContacts } from '../services/contactService'

export default function EmergencyContacts({ navigation }) {

const [contatos,setContatos]=useState([])
const [nome,setNome]=useState('')
const [telefone,setTelefone]=useState('')
const [relacao,setRelacao]=useState('')

const [userId,setUserId]=useState(null)

const [editingContact,setEditingContact]=useState(null)
const [modalVisible,setModalVisible]=useState(false)

const [phoneContacts,setPhoneContacts]=useState([])
const [contactsModalVisible,setContactsModalVisible]=useState(false)
const [contactSearch,setContactSearch]=useState('')

const MAX_CONTATOS=3

const restante=
MAX_CONTATOS-contatos.length

const textoInfo=
restante===0
? 'Você já adicionou o máximo de contatos'
: restante===1
? 'Você pode adicionar mais 1 contato'
: `Você pode adicionar mais ${restante} contatos`

useEffect(()=>{
loadUser()
},[])

async function loadUser(){

const {data}=await supabase.auth.getUser()

if(data?.user){

setUserId(data.user.id)

loadContacts(data.user.id)

}

}

async function loadContacts(id){

const {data}=await supabase
.from('emergency_contacts')
.select('*')
.eq('user_id',id)

setContatos(data||[])

}

function validarTelefone(tel){

const cleaned=
tel
.replace(/\D/g,'')
.replace(/^55/,'')

return (
cleaned.length>=10 &&
cleaned.length<=11
)

}

function limparCampos(){

setNome('')
setTelefone('')
setRelacao('')

}

async function handleAdd(){

if(!nome||!telefone){

Alert.alert(
'Erro',
'Preencha nome e telefone'
)

return

}

if(!validarTelefone(telefone)){

Alert.alert(
'Erro',
'Telefone inválido'
)

return

}

if(contatos.length>=MAX_CONTATOS){

Alert.alert(
'Limite',
'Máximo de contatos atingido'
)

return

}

const numeroLimpo=
telefone
.replace(/\D/g,'')
.replace(/^55/,'')

const {error}=await supabase
.from('emergency_contacts')
.insert({

user_id:userId,
nome,
telefone:numeroLimpo,
relacao

})

if(error){

Alert.alert(
'Erro',
error.message
)

return

}

limparCampos()

loadContacts(userId)

}

async function handleDelete(id){

await supabase
.from('emergency_contacts')
.delete()
.eq('id',id)

loadContacts(userId)

}

function openEditModal(contact){

setEditingContact(contact)

setModalVisible(true)

}

async function handleSaveEdit(){

await supabase
.from('emergency_contacts')
.update({

nome:editingContact.nome,
telefone:editingContact.telefone,
relacao:editingContact.relacao

})
.eq(
'id',
editingContact.id
)

setModalVisible(false)

loadContacts(userId)

}

async function openPhoneContacts(){

const data=
await getPhoneContacts()

const sorted=
(data||[])
.filter(
c=>
c.name &&
c.phoneNumbers?.length
)

.sort((a,b)=>

a.name.localeCompare(
b.name,
'pt-BR'
)

)

setPhoneContacts(sorted)

setContactSearch('')

setContactsModalVisible(true)

}

const filteredContacts=contactSearch.trim()===''
? phoneContacts
: phoneContacts.filter(c=>{
const term=contactSearch.toLowerCase()
return (
c.name?.toLowerCase().includes(term) ||
c.phoneNumbers?.[0]?.number?.includes(term)
)
})

return(

<SafeAreaView
style={styles.container}
>

<ScrollView
contentContainerStyle={{
padding:20
}}
>

<TouchableOpacity
onPress={()=>
navigation.goBack()
}
>

<Text style={styles.back}>
← Voltar
</Text>

</TouchableOpacity>

<Text style={styles.title}>
Contatos de Emergência
</Text>

<Text style={styles.subtitle}>
{textoInfo}
</Text>

<View style={styles.card}>

<Text style={styles.label}>
Nome
</Text>

<TextInput
style={styles.input}
value={nome}
onChangeText={setNome}
/>

<Text style={styles.label}>
Telefone
</Text>

<TextInput
style={styles.input}
value={telefone}
onChangeText={setTelefone}
keyboardType="phone-pad"
/>

<Text style={styles.label}>
Relação
</Text>

<TextInput
style={styles.input}
value={relacao}
onChangeText={setRelacao}
placeholder="Ex: mãe"
/>

<TouchableOpacity
style={styles.selectButton}
onPress={openPhoneContacts}
>

<Text style={styles.selectButtonText}>
📱 Selecionar da agenda
</Text>

</TouchableOpacity>

<TouchableOpacity
style={styles.button}
onPress={handleAdd}
>

<Text style={styles.buttonText}>
Adicionar
</Text>

</TouchableOpacity>

<TouchableOpacity
onPress={limparCampos}
>

<Text style={styles.clearText}>
Limpar campos
</Text>

</TouchableOpacity>

</View>


{contatos.map(item=>(

<View
key={item.id}
style={styles.contact}
>

<View>

<Text style={styles.name}>
{item.nome}
</Text>

<Text style={styles.phone}>
{item.telefone}
</Text>

<Text style={styles.relacao}>
{item.relacao}
</Text>

</View>

<View style={styles.actions}>

<TouchableOpacity
onPress={()=>
openEditModal(item)
}
>

<Text style={styles.icon}>
✏️
</Text>

</TouchableOpacity>

<TouchableOpacity
onPress={()=>
handleDelete(item.id)
}
>

<Text style={styles.icon}>
🗑️
</Text>

</TouchableOpacity>

</View>

</View>

))}


<Modal
visible={contactsModalVisible}
animationType="slide"
>

<ScrollView
style={{
paddingTop:80,
paddingHorizontal:20,
backgroundColor:"#F5EFEA"
}}
>

<TouchableOpacity
onPress={()=>
setContactsModalVisible(false)
}
>

<Text
style={{
color:"#025382",
fontSize:18,
marginBottom:25
}}
>
← Voltar
</Text>

</TouchableOpacity>


<Text
style={{
fontSize:28,
fontWeight:'bold',
marginBottom:16
}}
>

Selecionar contato

</Text>

<TextInput
style={styles.searchInput}
value={contactSearch}
onChangeText={setContactSearch}
placeholder="Buscar por nome ou número..."
placeholderTextColor="#AAA"
autoCorrect={false}
clearButtonMode="while-editing"
/>

{filteredContacts.length===0&&(
<Text style={styles.emptySearch}>
Nenhum contato encontrado
</Text>
)}

{filteredContacts.map(contact=>(

<TouchableOpacity

key={contact.id}

style={styles.phoneCard}

onPress={()=>{

setNome(contact.name)

setTelefone(
contact.phoneNumbers?.[0]
?.number || ''
)

setContactsModalVisible(false)

}}

>

<Text style={styles.phoneName}>
{contact.name}
</Text>

<Text style={styles.phoneNumber}>
{contact.phoneNumbers?.[0]?.number}
</Text>

</TouchableOpacity>

))}

</ScrollView>

</Modal>


<Modal
visible={modalVisible}
transparent
animationType="slide"
>

<View style={styles.modalOverlay}>

<View style={styles.modal}>

<Text style={styles.modalTitle}>
Editar contato
</Text>

<Text style={styles.label}>
Nome
</Text>

<TextInput
style={styles.input}
value={editingContact?.nome || ''}
onChangeText={(t)=>

setEditingContact({
...editingContact,
nome:t
})

}
/>

<Text style={styles.label}>
Telefone
</Text>

<TextInput
style={styles.input}
value={editingContact?.telefone || ''}
onChangeText={(t)=>

setEditingContact({
...editingContact,
telefone:t
})

}
/>

<Text style={styles.label}>
Relação
</Text>

<TextInput
style={styles.input}
value={editingContact?.relacao || ''}
onChangeText={(t)=>

setEditingContact({
...editingContact,
relacao:t
})

}
/>

<TouchableOpacity
style={styles.button}
onPress={handleSaveEdit}
>

<Text style={styles.buttonText}>
Salvar
</Text>

</TouchableOpacity>

<TouchableOpacity
onPress={()=>
setModalVisible(false)
}
>

<Text style={styles.clearText}>
Cancelar
</Text>

</TouchableOpacity>

</View>

</View>

</Modal>

</ScrollView>

</SafeAreaView>

)

}

const styles=StyleSheet.create({

container:{
flex:1,
backgroundColor:"#F5EFEA"
},

back:{
color:'#025382',
marginBottom:10
},

title:{
fontSize:30,
fontWeight:'bold',
color:'#025382'
},

subtitle:{
color:'#3A7FA6',
marginBottom:20
},

card:{
backgroundColor:'#FFF',
padding:20,
borderRadius:20,
marginBottom:20
},

label:{
marginTop:10,
color:'#3A7FA6',
fontSize:16
},

input:{
borderWidth:1,
borderColor:'#DDD',
borderRadius:12,
padding:14,
marginTop:5
},

selectButton:{
backgroundColor:"#C2185B",
padding:16,
borderRadius:14,
marginTop:25,
alignItems:"center"
},

button:{
backgroundColor:"#025382",
padding:16,
borderRadius:14,
marginTop:14,
alignItems:"center"
},

selectButtonText:{
color:"#FFF",
fontWeight:"bold"
},

buttonText:{
color:"#FFF",
fontWeight:"bold"
},

clearText:{
textAlign:"center",
marginTop:14,
color:"#999"
},

contact:{
backgroundColor:"#FFF",
padding:15,
borderRadius:15,
marginBottom:10,
flexDirection:'row',
justifyContent:'space-between'
},

name:{
fontWeight:'bold',
fontSize:18
},

phone:{
color:"#666"
},

relacao:{
color:"#025382"
},

actions:{
flexDirection:'row',
gap:15
},

icon:{
fontSize:22
},

searchInput:{
backgroundColor:"#FFF",
borderRadius:14,
padding:14,
fontSize:16,
marginBottom:18,
borderWidth:1,
borderColor:'#DDD'
},

emptySearch:{
textAlign:'center',
color:'#999',
marginTop:30,
fontSize:16
},

phoneCard:{
backgroundColor:"#FFF",
padding:20,
borderRadius:20,
marginBottom:14
},

phoneName:{
fontWeight:'bold',
fontSize:18
},

phoneNumber:{
marginTop:5,
color:"#666"
},

modalOverlay:{
flex:1,
backgroundColor:"#00000066",
justifyContent:"center"
},

modal:{
backgroundColor:"#FFF",
margin:20,
borderRadius:20,
padding:20
},

modalTitle:{
fontSize:18,
fontWeight:'bold',
marginBottom:15
}

})