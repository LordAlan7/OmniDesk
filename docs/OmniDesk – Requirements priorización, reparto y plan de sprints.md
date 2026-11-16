# OmniDesk – Requirements: priorización, reparto y plan de sprints

Software Projects Management · BIS 9C · Equipo: Alan Moreno Nevárez, César Alexis Meza Martínez, Edgar Alan Meráz Casas, Mariana Nuñez de la Hoya

Fuentes: A1 (roles y charter), A3 (requerimientos y correcciones de la matriz de calidad) y A4 (auditoría con IA).

## 1. Resumen

Se repartieron los **54 requerimientos** (21 FR, 12 NFR, 10 AIR y 11 BR) entre los 4 integrantes según sus roles y habilidades del A1. Las tablas de requerimientos de la sección 5 conservan **exactamente las mismas columnas** que en el A3; solo cambié la prioridad donde había inconsistencias y ordené las filas por prioridad y sprint. El reparto y los sprints están en tablas aparte (secciones 2 a 4) para que puedas llevarlos a Confluence y Jira sin tocar las tablas originales.

**Criterios de reparto**

**Alan (Architect / Fullstack / IA):** arquitectura, seguridad, API y todo el núcleo del asistente de IA (RAG).

**César (Fullstack / PM):** lógica de tickets (middleware/backend), adjuntos, flujo de resolución e integración de IA con tickets.

**Edgar (QA con perfil de base de datos):** modelo de datos, integridad, trazabilidad, base de conocimiento, reportes y requerimientos medibles (rendimiento, disponibilidad). Además valida todo lo que entra a integración, como indica el acuerdo de equipo.

**Mariana (UI/UX y Frontend):** vistas, flujos de revisión humana, dashboards, notificaciones y usabilidad.

**Equidad:** se estimó un esfuerzo relativo por requerimiento (S=1, M=2, L=3, XL=5; las reglas de negocio valen 1). Resultado: **Alan 25, César 25, Edgar 25, Mariana 24 puntos**. Son estimaciones mías; ajústenlas en planning poker.

**Criterios de prioridad:** MoSCoW del A3, dependencias entre requerimientos y los hitos del charter (A1).

## 2. Problemas encontrados en los requerimientos (revisar antes de subir a Jira)

| # | Problema | Qué hice |
| --- | --- | --- |
| 1 | En Requirements Prioritization (A3), **FR-018 aparece dos veces** (Should y Could). El segundo, por su justificación (notificaciones), es **FR-020**. | Corregido: FR-018 Should Have, FR-020 Could Have. |
| 2 | Esa misma tabla **no incluye** FR-002, FR-019, NFR-004, NFR-007, NFR-010, NFR-011 ni NFR-012; la matriz de trazabilidad y la tabla de aprobación tampoco incluyen FR-002. | Los incluí con la prioridad que ya tenían en las tablas FR/NFR. |
| 3 | **FR-010 (Could Have)** contradice BR-004 (cada ticket **debe** tener tienda, modelo de moto, tipo, etc.) y FR-003 depende de esa información. | Subido a **Must Have** (campos mínimos junto con FR-003). |
| 4 | **FR-012 (Should Have)** es dependencia de requerimientos Must/High: FR-013, AIR-002, AIR-003 y AIR-007 necesitan manuales y documentación para que el RAG funcione. | Subido a **Must Have**. |
| 5 | **Redundancias**: FR-014 = AIR-005; FR-015 = AIR-004 = AIR-006 (+ BR-005, BR-010); FR-021 = AIR-010 (+ BR-006); FR-011 y FR-019 se traslapan; FR-001 / NFR-001 / BR-009 / AIR-008. | No eliminé IDs (se perdería trazabilidad). En Jira conviene una sola historia por grupo con los AIR/BR como criterios de aceptación o subtareas. |
| 6 | **NFR-002** decía solo "appropriate security mechanisms". | Apliqué la corrección del A4: se listan los mecanismos (contraseñas, sesiones, control de acceso, cifrado, archivos). |
| 7 | Requerimientos **no medibles** (NFR-004, NFR-005, NFR-006, NFR-008, NFR-011) y sin números definidos (OI-008). | No inventé cifras. Cada uno debe iniciar con una tarea "definir métrica" con el stakeholder. |
| 8 | **BR-003** mezcla categorías ("activated, store issue"); en la situación actual hay 3 tipos: assembled, activated y store. | Pendiente de confirmar con el stakeholder (OI-004). |
| 9 | **Escalas distintas**: FR/NFR usan MoSCoW y AIR usa High/Medium/Low. | Las dejé como estaban (High ≈ Must, Medium ≈ Should/Could, Low ≈ Could). |
| 10 | **FR-009 (Must) depende de la base de conocimiento (FR-011)**. | Ambos van en el mismo sprint (3). |

**Bloqueos con el stakeholder** (preguntar pronto): OI-001/OI-002 (seguimiento y notificaciones → FR-018, FR-020), OI-004 (categorías → FR-005, BR-003), OI-005 (prioridades y plazos → FR-006, FR-008), OI-006 (cotización → FR-021, AIR-010) y OI-007 (documentos autorizados → AIR-002, FR-012).

## 3. Reparto por integrante

| Integrante | Rol (A1) | Requerimientos | Total | Puntos |
| --- | --- | --- | --- | --- |
| Alan Moreno Nevárez | Fullstack Developer / Architect of Software | FR-001, FR-008, FR-013, NFR-002, NFR-007, NFR-008, AIR-001, AIR-002, AIR-008, AIR-009, BR-007, BR-009 | 12 | 25 |
| César Alexis Meza Martínez | Fullstack Developer / Project Manager | FR-003, FR-004, FR-006, FR-009, FR-014, FR-021, NFR-001, AIR-004, AIR-005, AIR-006, AIR-010, BR-001, BR-002, BR-005, BR-006 | 15 | 25 |
| Edgar Alan Meráz Casas | Tester / QA (perfil de base de datos) | FR-005, FR-010, FR-011, FR-017, FR-019, NFR-004, NFR-005, NFR-009, NFR-010, NFR-012, AIR-007, BR-003, BR-008 | 13 | 25 |
| Mariana Nuñez de la Hoya | AI-Enhanced UI/UX & Frontend Designer | FR-002, FR-007, FR-012, FR-015, FR-016, FR-018, FR-020, NFR-003, NFR-006, NFR-011, AIR-003, BR-004, BR-010, BR-011 | 14 | 24 |

**Puntos por sprint y persona**

| Integrante | S1 | S2 | S3 | S4 | S5 | S6 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Alan | 4 | 3 | 3 | 12 | 2 | 1 | 25 |
| César | 2 | 7 | 5 | 3 | 3 | 5 | 25 |
| Edgar | 2 | 7 | 5 | 2 | 7 | 2 | 25 |
| Mariana | 2 | 5 | 2 | 7 | 5 | 3 | 24 |
| **Total sprint** | 10 | 22 | 15 | 24 | 17 | 11 | 99 |

El Sprint 4 carga más a Alan porque es el núcleo del asistente de IA (RAG); el Sprint 6 es ligero a propósito, para pruebas y estabilización.

## 4. Plan de sprints

Alineado con los hitos del charter (A1). Los sprints son de unas 2 semanas, según la revisión quincenal acordada. **Nota:** el hito de autenticación (2 de octubre) ya pasó; si ya tienen avance, dime qué está hecho y reajusto el plan.

| Sprint | Objetivo | Hitos del charter | Requerimientos |
| --- | --- | --- | --- |
| **Sprint 1** | Fundación: arquitectura, base de datos, autenticación y roles | 2 oct | FR-001, FR-002, NFR-001, NFR-007, NFR-010 |
| **Sprint 2** | Núcleo de tickets: crear, clasificar, priorizar, asignar y dar seguimiento | 16 oct | FR-003, FR-005, FR-006, FR-007, FR-008, FR-010, NFR-009, FR-018, BR-001 a BR-004 |
| **Sprint 3** | Cierre de tickets, base de conocimiento, documentos y archivos | 23 oct (y 30 oct: elegir enfoque de IA) | FR-009, FR-011, FR-012, NFR-002, FR-004, FR-019, BR-008 |
| **Sprint 4** | Asistente de IA e integración con tickets y base de conocimiento | 13 y 20 nov | FR-013, FR-015, NFR-003, AIR-001, AIR-002, AIR-003, AIR-004, AIR-006, AIR-007, AIR-008, BR-005, BR-007, BR-009, BR-010, BR-011 |
| **Sprint 5** | Dashboards, reportes y funciones opcionales; evaluación de la IA | 27 nov | FR-016, FR-017, NFR-012, NFR-005, AIR-009, AIR-005, FR-014, FR-020 |
| **Sprint 6** | Pruebas, estabilización, documentación y entrega | 4, 8, 10 y 11 dic | NFR-004, NFR-006, NFR-011, NFR-008, FR-021, AIR-010, BR-006 |

**Por qué algunos "Should" van antes:** NFR-007 y NFR-010 están en Sprint 1 y FR-018 en Sprint 2 porque son base técnica o dependen directamente de lo que se construye en ese sprint. FR-021 y AIR-010 (cotización con IA, experimental) quedan al final y solo se hacen si el stakeholder confirma el alcance (OI-006).

### Asignación detallada (para cargar a Jira)

| Sprint | ID | Requirement | Priority | Responsable | Apoyo |
| --- | --- | --- | --- | --- | --- |
| 1 | FR-001 | User Authentication and Role-Based Access | Must Have | Alan | César |
| 1 | FR-002 | User and Technician Management | Must Have | Mariana | César |
| 1 | NFR-001 | Access Control | Must Have | César | Alan |
| 1 | NFR-007 | Maintainability | Should Have | Alan | César |
| 1 | NFR-010 | Data Integrity | Should Have | Edgar | Alan |
| 2 | FR-003 | Support Ticket Creation | Must Have | César | Mariana |
| 2 | FR-005 | Ticket Classification | Must Have | Edgar | César |
| 2 | FR-006 | Ticket Priority Management | Must Have | César | Mariana |
| 2 | FR-007 | Technician Assignment | Must Have | Mariana | César |
| 2 | FR-008 | Ticket Status and Deadline Tracking | Must Have | Alan | César |
| 2 | FR-010 | Ticket Business Information | Must Have | Edgar | César |
| 2 | NFR-009 | Traceability and Auditability | Must Have | Edgar | Alan |
| 2 | BR-001 | Manager defines ticket priority | — | César | Mariana |
| 2 | BR-002 | Service advisors assign tickets | — | César | Mariana |
| 2 | BR-003 | Organization-defined ticket categories | — | Edgar | César |
| 2 | BR-004 | Minimum information per ticket | — | Mariana | César |
| 2 | FR-018 | Client Ticket Follow-Up | Should Have | Mariana | César |
| 3 | FR-009 | Ticket Investigation, Resolution and Closure | Must Have | César | Alan |
| 3 | FR-011 | Knowledge and Solution Library | Must Have | Edgar | Alan |
| 3 | FR-012 | Manuals and Technical Documentation | Must Have | Mariana | Edgar |
| 3 | NFR-002 | Information Security and Confidentiality | Must Have | Alan | Edgar |
| 3 | BR-008 | Document useful solutions in the knowledge base | — | Edgar | César |
| 3 | FR-004 | Ticket Evidence and File Attachments | Should Have | César | Mariana |
| 3 | FR-019 | Recurring Problems and Solutions | Should Have | Edgar | Mariana |
| 4 | FR-013 | AI Technical Support Assistant | Must Have | Alan | César |
| 4 | FR-015 | Human Validation of AI-Generated Information | Must Have | Mariana | César |
| 4 | NFR-003 | AI Transparency and Reliability | Must Have | Mariana | Alan |
| 4 | AIR-001 | AI Assistant for technical support | High | Alan | Mariana |
| 4 | AIR-002 | Authorized knowledge sources | High | Alan | Edgar |
| 4 | AIR-003 | AI response references | High | Mariana | Alan |
| 4 | AIR-004 | Human review of AI recommendations | High | César | Mariana |
| 4 | AIR-006 | AI Information Validation | High | César | Mariana |
| 4 | AIR-007 | AI Knowledge Traceability | High | Edgar | Alan |
| 4 | AIR-008 | AI Access Control | High | Alan | Edgar |
| 4 | BR-005 | Human review of AI ticket information | — | César | Mariana |
| 4 | BR-007 | AI uses only authorized information | — | Alan | Edgar |
| 4 | BR-009 | AI access depends on permissions | — | Alan | César |
| 4 | BR-010 | Users review AI recommendations | — | Mariana | César |
| 4 | BR-011 | System supports, not replaces, human decisions | — | Mariana | César |
| 5 | FR-016 | Dashboard and Service Metrics | Should Have | Mariana | Edgar |
| 5 | FR-017 | Support Reports | Should Have | Edgar | Mariana |
| 5 | NFR-012 | Reporting Accuracy | Should Have | Edgar | Mariana |
| 5 | NFR-005 | Performance | Should Have | Edgar | Alan |
| 5 | AIR-009 | AI Response Reliability | High | Alan | Edgar |
| 5 | AIR-005 | AI-Assisted Ticket Creation | Medium | César | Alan |
| 5 | FR-014 | AI-Assisted Ticket Creation | Could Have | César | Alan |
| 5 | FR-020 | Ticket Updates and Notifications | Could Have | Mariana | César |
| 6 | NFR-004 | System Availability and Reliability | Should Have | Edgar | Alan |
| 6 | NFR-006 | Usability | Should Have | Mariana | Edgar |
| 6 | NFR-011 | Compatibility | Should Have | Mariana | Edgar |
| 6 | NFR-008 | Scalability | Could Have | Alan | Edgar |
| 6 | FR-021 | AI-Assisted Quotation Support | Could Have | César | Alan |
| 6 | AIR-010 | AI-Assisted Quotation | Low | César | Alan |
| 6 | BR-006 | Human approval of AI quotations | — | César | Mariana |

## 5. Requerimientos (misma estructura del A3, ordenados por prioridad y sprint)

### Functional Requirements

| **ID** | **Requirement** | **Priority** | **Description** | **Acceptance Criteria** | **Dependencies** |
| --- | --- | --- | --- | --- | --- |
| **FR-001** | User Authentication and Role-Based Access | Must Have | The system shall authenticate users and provide access according to their assigned role and permissions. | Users can log in successfully, and users without the required permissions cannot access restricted functions or information. | User Management, Database |
| **FR-002** | User and Technician Management | Must Have | The system shall allow authorized users to create, update, activate, deactivate, and manage employee and technician accounts. | Authorized users can manage accounts and technician information, while unauthorized users cannot modify them. | Authentication, Database, Roles and Permissions |
| **FR-003** | Support Ticket Creation | Must Have | The system shall allow authorized employees to create and register support tickets containing the information required to identify and understand the reported problem. | A valid ticket is assigned a unique identifier and becomes available to authorized support personnel. | Authentication, Database, Ticket Information |
| **FR-005** | Ticket Classification | Must Have | The system shall allow tickets to be classified according to the problem categories defined by the organization. | A ticket can be assigned a valid problem category and the category is stored with the ticket. | Ticket Management, Business Rules |
| **FR-006** | Ticket Priority Management | Must Have | The system shall allow authorized managers to define and modify the priority of support tickets according to organizational criteria. | An authorized manager can assign or modify a ticket priority and the change is recorded. | Ticket Management, User Roles |
| **FR-007** | Technician Assignment | Must Have | The system shall allow authorized service advisors to assign and reassign tickets to technicians. | A ticket can be assigned to an available technician and the assignment is visible to authorized users. | Technician Management, Ticket Management |
| **FR-008** | Ticket Status and Deadline Tracking | Must Have | The system shall allow authorized users to update and monitor ticket status, progress, and deadlines. | Users can view the current status and deadline of a ticket, and status changes are recorded. | Ticket Management, Database |
| **FR-010** | Ticket Business Information | Must Have | The system shall store relevant business information associated with a ticket, including store location, motorcycle type or model, problem type, and other information defined by the organization. | Required business information can be recorded, viewed, and associated with the corresponding ticket. | Ticket Management, Database |
| **FR-009** | Ticket Investigation, Resolution and Closure | Must Have | The system shall allow technicians to document investigation activities, solutions, and the final resolution of tickets. | A technician can update a ticket with resolution information and an authorized user can close the ticket. | Ticket Management, Knowledge Base, User Roles |
| **FR-011** | Knowledge and Solution Library | Must Have | The system shall provide a centralized library containing documented technical problems, solutions, and troubleshooting information. | Authorized users can search, view, and use documented solutions related to technical problems. | Database, Knowledge Management |
| **FR-012** | Manuals and Technical Documentation | Must Have | The system shall allow authorized users to store, organize, search, and consult technical manuals and documentation. | Authorized users can access available documentation and identify the corresponding source. | File Storage, Knowledge Base, User Permissions |
| **FR-013** | AI Technical Support Assistant | Must Have | The system shall provide an AI assistant capable of helping authorized users with technical questions and troubleshooting activities. | The AI receives a technical question and provides a relevant recommendation while clearly identifying the response as AI-generated. | AI Service, Knowledge Base, Authentication |
| **FR-015** | Human Validation of AI-Generated Information | Must Have | The system shall require human review and validation of AI-generated information before it is considered final. | Users can review, modify, confirm, or reject AI-generated information before it is saved as final information. | AI Assistant, User Roles, Ticket Management |
| **FR-018** | Client Ticket Follow-Up | Should Have | The system shall allow employees or authorized users to view the status and progress of their previously submitted tickets. | A user can access their tickets and view their current status and relevant updates. | Authentication, Ticket Management |
| **FR-004** | Ticket Evidence and File Attachments | Should Have | The system shall allow users to attach relevant files or evidence to support tickets. | Authorized users can upload and view supported files associated with a ticket. | Ticket Management, File Storage |
| **FR-019** | Recurring Problems and Solutions | Should Have | The system shall allow authorized users to document and consult recurring technical problems and their corresponding solutions. | A recurring problem can be registered with its documented solution and later retrieved by authorized users. | Knowledge Base, Ticket Management |
| **FR-016** | Dashboard and Service Metrics | Should Have | The system shall provide dashboards displaying relevant information about tickets, priorities, deadlines, workload, and support activity. | Authorized managers can access a dashboard containing current support metrics and ticket information. | Ticket Management, Reporting |
| **FR-017** | Support Reports | Should Have | The system shall generate reports related to ticket activity, recurring problems, workload, and support performance. | Authorized users can generate or view reports using the available system data. | Dashboard, Ticket Management, Database |
| **FR-014** | AI-Assisted Ticket Creation | Could Have | The system shall allow the AI assistant to identify and organize relevant information from a user's problem description when creating a ticket. | The AI suggests ticket information and the user can review and modify it before the ticket is created. | AI Assistant, Ticket Management |
| **FR-020** | Ticket Updates and Notifications | Could Have | The system shall provide notifications or updates when relevant changes occur in a ticket, such as assignment, priority, status, or resolution. | Authorized users receive or can view an update when a relevant ticket event occurs. | Ticket Management, Notification Service |
| **FR-021** | AI-Assisted Quotation Support | Could Have | The system may provide AI assistance for preparing quotation information based on available ticket and service data. | The system can generate a quotation suggestion, but an authorized user must review and approve it before business use. | AI Assistant, Ticket Management, Business Information |

### Non-Functional Requirements

| **ID** | **Requirement** | **Priority** | **Description** | **Acceptance Criteria** | **Dependencies** |
| --- | --- | --- | --- | --- | --- |
| **NFR-001** | Access Control | Must Have | The system shall restrict access to functions and information according to each user's role and permissions. | Users cannot access functions or information outside their assigned permissions. | Authentication, User Roles |
| **NFR-009** | Traceability and Auditability | Must Have | The system shall maintain traceable records of relevant ticket activities, status changes, assignments, and AI-generated information. | Authorized users can identify relevant changes and actions associated with a ticket or AI-assisted process. | Database, Ticket Management, Logging |
| **NFR-002** | Information Security and Confidentiality | Must Have | The system shall protect sensitive organizational and user information from unauthorized access, modification, or disclosure. | Unauthorized users cannot access protected information, and sensitive information is stored and transmitted using defined security mechanisms (password protection, session security, access control, encryption, and file protection). | Authentication, Database, Infrastructure |
| **NFR-003** | AI Transparency and Reliability | Must Have | AI-generated recommendations shall be clearly identified and shall not be presented as guaranteed solutions. The AI shall indicate when sufficient information is unavailable. | AI responses are identified as recommendations and indicate when human review or additional information is required. | AI Service, Knowledge Base |
| **NFR-007** | Maintainability | Should Have | The system shall use a modular and organized architecture that allows components to be maintained and modified independently when possible. | Developers can modify or extend individual modules without unnecessarily affecting unrelated system components. | System Architecture, Codebase |
| **NFR-010** | Data Integrity | Should Have | The system shall maintain the accuracy and consistency of stored ticket, user, technician, and knowledge-base information. | Invalid or incomplete data is rejected when required, and stored records remain consistent across related modules. | Database, Validation |
| **NFR-005** | Performance | Should Have | The system shall provide acceptable response times for normal ticket, knowledge-base, dashboard, and user-management operations. | Normal system operations respond within an acceptable time under the expected project workload. | Infrastructure, Database |
| **NFR-012** | Reporting Accuracy | Should Have | Reports and dashboards shall use current and consistent system data to represent ticket activity, workload, priorities, and recurring problems. | Reported values correspond to the available ticket and system records at the time the report is generated. | Database, Dashboard, Reporting |
| **NFR-004** | System Availability and Reliability | Should Have | The system shall remain available and operate consistently during normal support activities. | Authorized users can access the platform during defined operating periods, and system failures do not result in loss of previously saved information. | Infrastructure, Database |
| **NFR-006** | Usability | Should Have | The system shall provide an interface that allows employees, technicians, service advisors, and managers to perform their tasks with minimal unnecessary complexity. | Representative users can complete the main workflows without requiring extensive technical assistance. | UI/UX, Frontend |
| **NFR-011** | Compatibility | Should Have | The web platform shall operate correctly on commonly used modern web browsers and standard desktop environments. | The main system functions can be used without critical interface or functionality errors in the supported browsers. | Frontend, Web Server |
| **NFR-008** | Scalability | Could Have | The system shall be designed to support future growth in users, tickets, knowledge documents, and system functionality. | The architecture allows additional users, records, and modules to be incorporated without requiring a complete redesign. | Architecture, Database, Infrastructure |

### Business Rules

| **ID** | **Description** |
| --- | --- |
| BR-001 | The manager is responsible for defining the priority of each ticket according to the importance and urgency problem. |
| BR-002 | Service advisors are responsible for assigning tickets to the appropriate technicians and following their progress until the problem is resolved. |
| BR-003 | Tickets must use the problem categories defined by the organization, such as activated, store issue, or other categories established by the stakeholder. |
| BR-004 | Each ticket must contain the relevant information needed to understand and follow the problem, such as its description, type, store, motorcycle model, priority, assigned technician, and status. |
| BR-008 | When a problem is solved and is considered useful for future cases, its solution may be documented in the knowledge. |
| BR-005 | Information generated or suggested by the AI when creating a ticket must be reviewed and confirmed by a human. |
| BR-007 | The AI assistant can only use authorized organizational information, such as approved manuals, technical documentation, and previously documented solutions. |
| BR-009 | Access to the AI assistant and organizational knowledge must depend on the user's permissions and authorization. |
| BR-010 | Technicians and other authorized users are responsible for reviewing AI recommendations. |
| BR-011 | The system must keep the responsibilities of users clear, so the platform supports the existing work process instead of replacing the decisions of managers or technicians. |
| BR-006 | AI-generated estimates or quotation information must be reviewed and approved by a human user before being used for business purposes. |

### AI Requirements

| ID: AIR-001 | Requirement: AI Assistant for technical support | Priority: High |
| --- | --- | --- |
| Description: The system shall provide an AI assistant that helps technicians and authorized employees with technical questions, ticket information, and possible solutions. |  |  |
| Acceptance criteria: The AI assistant can receive user questions and provide a response related to the organization's IT service process. The response must be presented as support information and not as a final decision. |  | Dependencies: Knowledge Base, User Authentication, AI Service |

| ID: AIR-002 | Requirement: Authorized knowledge sources | Priority: High |
| --- | --- | --- |
| Description: The AI shall use authorized organizational information, such as manuals, technical documents, and previously documented solutions, as sources for its responses. |  |  |
| Acceptance criteria: The AI only uses information from approved sources when providing organization-specific recommendations. |  | Dependencies: Knowledge Base, Manuals and Documentation, AI Assistant |

| ID: AIR-003 | Requirement: AI response references | Priority: High |
| --- | --- | --- |
| Description: The AI shall provide references or links to the source information used to support its responses when applicable. |  |  |
| Acceptance criteria: Users can identify the document, manual, or knowledge source related to the information provided by the AI. |  | Dependencies: AI Assistant, Knowledge Base, Authorized Knowledge Sources |

| ID: AIR-004 | Requirement: Human review of AI recommendations | Priority: High |
| --- | --- | --- |
| Description: AI recommendations shall be reviewed by an authorized employee or technician before they are applied to a real problem. |  |  |
| Acceptance criteria: The system clearly presents AI information as a recommendation and allows the user to make the final decision. |  | Dependencies: AI Assistant, User Roles and Permissions, Ticket Management |

| ID: AIR-006 | Requirement: AI Information Validation | Priority: High |
| --- | --- | --- |
| Description: Information generated by the AI for tickets or other system processes shall require human validation before being considered final. |  |  |
| Acceptance criteria: Users can review and confirm or modify AI-generated information before it is saved as final system information. |  | Dependencies: AI Assistant, Ticket Management, User Roles and Permissions |

| ID: AIR-007 | Requirement: AI Knowledge Traceability | Priority: High |
| --- | --- | --- |
| Description: The system shall keep the connection between AI responses and the organizational information used to generate them. |  |  |
| Acceptance criteria: When a response is based on organizational documentation, the user can identify the source used by the AI. |  | Dependencies: Knowledge Base, Manuals and Documentation, AI Service |

| ID: AIR-008 | Requirement: AI Access Control | Priority: High |
| --- | --- | --- |
| Description: Access to the AI assistant and organizational knowledge shall depend on the user's role and authorization. |  |  |
| Acceptance criteria: Only authorized users can access the AI assistant and information that is available for their role. |  | Dependencies: User Authentication, User Roles and Permissions, Knowledge Base |

| ID: AIR-009 | Requirement: AI Response Reliability | Priority: High |
| --- | --- | --- |
| Description: The AI shall be designed to avoid inventing information and should indicate when it does not have enough information to provide a reliable response. |  |  |
| Acceptance criteria: The AI does not present unsupported information as a confirmed solution and indicates when additional information or human review is required. |  | Dependencies: AI Service, Knowledge Base, AI Knowledge Traceability |

| ID: AIR-005 | Requirement: AI-Assisted Ticket Creation | Priority: Medium |
| --- | --- | --- |
| Description: The AI shall assist users in creating tickets by helping organize or identify relevant information from the problem description. |  |  |
| Acceptance criteria: The AI can suggest relevant ticket information, but the user must review and confirm the information before the ticket is created or updated. |  | Dependencies: Ticket Management, AI Assistant, User Authentication |

| ID: AIR-010 | Requirement: AI-Assisted Quotation | Priority: Low |
| --- | --- | --- |
| Description: The system may provide AI assistance for preparing quotation information based on available ticket or service data. |  |  |
| Acceptance criteria: The AI can generate a quotation suggestion, but an authorized user must review and approve it before it is used. |  | Dependencies: AI Assistant, Ticket Management, Business Information |

## 6. Registro de cambios sobre el A3

| Requerimiento | Cambio | Motivo |
| --- | --- | --- |
| FR-010 | Priority: Could Have → Must Have | BR-004 exige esos datos en cada ticket y FR-003 depende de ellos. |
| FR-012 | Priority: Should Have → Must Have | Es dependencia de FR-013, AIR-002, AIR-003 y AIR-007. |
| NFR-002 | Acceptance Criteria: "appropriate security mechanisms" → mecanismos definidos | Corrección del A4 (password protection, session security, access control, encryption, file protection). |
| Todas las tablas | Filas ordenadas por prioridad y sprint | Para planear los sprints. Columnas y textos sin cambio. |
| Prioritization (A3) | FR-018 duplicado → el segundo es FR-020; faltantes agregados | Ver sección 2. |